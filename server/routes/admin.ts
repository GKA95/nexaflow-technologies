import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router } from 'express';
import { connectDB, getLastDBError, isDBConfigured } from '../db.js';
import { DEFAULT_SEO_PAGES, DEFAULT_SITE_SETTINGS } from '../defaults.js';
import {
  authLimiter,
  isGoogleOAuthConfigured,
  isJwtSecretConfigured,
  isValidObjectId,
  requireAdmin,
  requireAuth,
  requireDatabase,
  requireSuperAdmin,
  sanitizeCsvCell,
  setSessionCookie,
  signSessionToken,
  slugify,
  stripHtmlTags,
} from '../middleware/auth.js';
import {
  AdminActivity,
  AnalyticsEvent,
  Article,
  Coupon,
  Course,
  CourseReview,
  Enrolment,
  Lead,
  LeadActivity,
  Lesson,
  LessonProgress,
  Module,
  Notification,
  PasswordResetToken,
  Payment,
  Product,
  SEOSettings,
  Service,
  SiteSettings,
  SupportMessage,
  SupportTicket,
  Testimonial,
  User,
  WorkShowcase,
} from '../models.js';
import {
  adminCreateSchema,
  adminSetupFormSchema,
  adminUpdateSchema,
  articleWriteSchema,
  bulkLessonsWriteSchema,
  couponWriteSchema,
  courseReviewUpdateSchema,
  courseWriteSchema,
  leadActivityWriteSchema,
  leadUpdateSchema,
  learnerEnrolAssignSchema,
  lessonWriteSchema,
  moduleWriteSchema,
  paymentRefundSchema,
  productWriteSchema,
  seoPageUpdateSchema,
  serviceWriteSchema,
  siteSettingsWriteSchema,
  testimonialWriteSchema,
  ticketStatusUpdateSchema,
  workShowcaseWriteSchema,
  zodToFieldErrors,
} from '../shared/validation.js';
import { isEmailConfigured, sendTransactionalEmail } from '../utils/email.js';
import {
  getPaystackMode,
  isPaystackConfigured,
  refundPaystackTransaction,
} from '../utils/paystack.js';
import { serializePayment } from './payments.js';

const router = Router();

const coursePatchSchema = courseWriteSchema.partial();
const modulePatchSchema = moduleWriteSchema.partial();
const lessonPatchSchema = lessonWriteSchema.partial();
const productPatchSchema = productWriteSchema.partial();
const servicePatchSchema = serviceWriteSchema.partial();
const articlePatchSchema = articleWriteSchema.partial();
const workShowcasePatchSchema = workShowcaseWriteSchema.partial();
const testimonialPatchSchema = testimonialWriteSchema.partial();
const couponPatchSchema = couponWriteSchema.partial();

async function logAdminActivity(
  admin: { id: string; email: string },
  action: string,
  entityType: string,
  entityId = '',
  details = ''
) {
  await AdminActivity.create({
    adminId: admin.id,
    adminEmail: admin.email,
    action,
    entityType,
    entityId: String(entityId),
    details,
  });
}

// Publicly checkable ONLY for knowing whether initial setup is still open (exposes zero secrets)
router.get('/setup-status', async (req, res) => {
  const dbConfigured = isDBConfigured();
  const setupTokenConfigured = Boolean(
    process.env.ADMIN_SETUP_TOKEN?.trim() &&
      !process.env.ADMIN_SETUP_TOKEN.includes('replace-with')
  );
  const googleConfigured = isGoogleOAuthConfigured();
  const emailConfigured = isEmailConfigured();
  const isProduction = process.env.NODE_ENV === 'production';

  if (!dbConfigured) {
    const lastErr = getLastDBError();
    return res.json({
      dbConfigured: false,
      dbConnected: false,
      dbErrorCode: lastErr.code || 'NOT_CONFIGURED',
      dbError: isProduction && lastErr.code === 'UNKNOWN' ? 'Database unavailable' : lastErr.message || null,
      adminExists: false,
      setupTokenConfigured,
      googleConfigured,
      emailConfigured,
      isProduction,
    });
  }
  const conn = await connectDB({ force: req.query.retry === '1' });
  if (!conn) {
    const lastErr = getLastDBError();
    return res.json({
      dbConfigured: true,
      dbConnected: false,
      dbErrorCode: lastErr.code || 'UNKNOWN',
      dbError: isProduction && lastErr.code === 'UNKNOWN' ? 'Database unavailable' : lastErr.message || null,
      adminExists: false,
      setupTokenConfigured,
      googleConfigured,
      emailConfigured,
      isProduction,
    });
  }

  const adminCount = await User.countDocuments({ role: { $in: ['admin', 'super_admin'] } });
  res.json({
    dbConfigured: true,
    dbConnected: true,
    dbErrorCode: null,
    dbError: null,
    adminExists: adminCount > 0,
    setupTokenConfigured,
    googleConfigured,
    emailConfigured,
    isProduction,
  });
});

// One-time secure Super Admin creation — disabled permanently after first admin exists
router.post('/setup', authLimiter, requireDatabase, async (req, res) => {
  try {
    const adminCount = await User.countDocuments({ role: { $in: ['admin', 'super_admin'] } });
    if (adminCount > 0) {
      return res.status(403).json({
        error: 'Administrator setup is permanently locked because an administrator already exists.',
      });
    }

    const rawEnvToken = process.env.ADMIN_SETUP_TOKEN?.trim();
    const hasSetupToken = Boolean(rawEnvToken && !rawEnvToken.includes('replace-with'));
    if (!hasSetupToken && process.env.NODE_ENV === 'production') {
      return res.status(503).json({
        error:
          'ADMIN_SETUP_TOKEN must be configured in production server environment variables before creating the initial administrator.',
      });
    }

    if (process.env.NODE_ENV === 'production' && !isJwtSecretConfigured()) {
      return res.status(503).json({
        error:
          'JWT_SECRET (at least 16 characters) must be configured in environment secrets before creating an administrator.',
      });
    }

    const parsed = adminSetupFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid setup data.',
        fieldErrors: zodToFieldErrors(parsed.error),
      });
    }

    if (hasSetupToken && rawEnvToken) {
      const a = Buffer.from(parsed.data.setupToken || '');
      const b = Buffer.from(rawEnvToken);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(403).json({ error: 'Invalid administrator setup token.' });
      }
    }

    const normalizedEmail = parsed.data.email.toLowerCase();
    const secondaryEmails = Array.from(
      new Set(parsed.data.secondaryEmails.map((e) => e.toLowerCase()).filter((e) => e !== normalizedEmail))
    );
    const existing = await User.findOne({
      $or: [
        { email: { $in: [normalizedEmail, ...secondaryEmails] } },
        { secondaryEmails: { $in: [normalizedEmail, ...secondaryEmails] } },
      ],
    }).lean();
    if (existing) {
      return res.status(409).json({
        error: 'An account with this email already exists in MongoDB. Use another email or sign in.',
      });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const created = await User.create({
      name: stripHtmlTags(parsed.data.name),
      email: normalizedEmail,
      secondaryEmails,
      passwordHash,
      authProviders: ['local'],
      role: 'super_admin',
      active: true,
    });

    const authUser = {
      id: created._id.toString(),
      email: created.email,
      name: created.name,
      role: 'super_admin' as const,
    };

    try {
      await logAdminActivity(
        { id: authUser.id, email: authUser.email },
        'initial_super_admin_created',
        'User',
        authUser.id,
        'Completed initial secure administrator setup'
      );
    } catch (logErr) {
      console.warn('[Admin Setup] Non-fatal activity log error:', logErr);
    }

    const token = signSessionToken(authUser);
    setSessionCookie(req, res, token);

    return res.status(201).json({ user: authUser, sessionToken: token });
  } catch (err) {
    console.error('[Admin Setup] Error creating initial administrator:', err);
    const isProd = process.env.NODE_ENV === 'production';
    return res.status(500).json({
      error:
        !isProd && err instanceof Error && err.message
          ? `Administrator setup error: ${err.message}`
          : 'Unexpected server error during administrator setup.',
    });
  }
});

// All routes below strictly require MongoDB + Authenticated Admin Role
router.use(requireDatabase, requireAuth, requireAdmin);

// 1. Admin Dashboard Overview (Real metrics only)
router.get('/overview', async (_req, res) => {
  const [
    totalLearners,
    publishedCourses,
    totalEnrolments,
    verifiedPaymentsAgg,
    recentPayments,
    totalLeads,
    newLeads,
    qualifiedLeads,
    convertedLeads,
    openTickets,
    recentActivity,
    recentLeads,
    unreadNotifications,
  ] = await Promise.all([
    User.countDocuments({ role: 'learner' }),
    Course.countDocuments({ published: true }),
    Enrolment.countDocuments({ status: 'active' }),
    Payment.aggregate([
      { $match: { status: 'success' } },
      { $group: { _id: '$currency', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Payment.find()
      .select('-processedEvents')
      .populate('userId', 'name email')
      .populate('courseId', 'title')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Lead.countDocuments(),
    Lead.countDocuments({ status: 'New' }),
    Lead.countDocuments({ status: 'Qualified' }),
    Lead.countDocuments({ status: 'Converted' }),
    SupportTicket.countDocuments({ status: { $in: ['Open', 'In Progress'] } }),
    AdminActivity.find().sort({ createdAt: -1 }).limit(8).lean(),
    Lead.find().sort({ createdAt: -1 }).limit(5).lean(),
    Notification.countDocuments({ targetRole: 'admin', read: false }),
  ]);

  res.json({
    metrics: {
      totalLearners,
      publishedCourses,
      totalEnrolments,
      revenueByCurrency: verifiedPaymentsAgg,
      totalLeads,
      newLeads,
      qualifiedLeads,
      convertedLeads,
      leadConversionRate: totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(1)) : 0,
      openTickets,
      unreadNotifications,
    },
    recentPayments,
    recentLeads,
    recentActivity,
    integrations: {
      mongodb: true,
      paystack: { configured: isPaystackConfigured(), mode: getPaystackMode() },
      email: { configured: isEmailConfigured() },
      google: { configured: isGoogleOAuthConfigured() },
    },
  });
});

// 2. Course, Module & Lesson Management
router.get('/courses', async (_req, res) => {
  const courses = await Course.find().sort({ order: 1, createdAt: -1 }).lean();
  const enriched = await Promise.all(
    courses.map(async (c: Record<string, unknown>) => {
      const modules = await Module.find({ courseId: c._id }).sort({ order: 1 }).lean();
      const lessons = await Lesson.find({ courseId: c._id }).sort({ order: 1 }).lean();
      const enrolmentsCount = await Enrolment.countDocuments({ courseId: c._id, status: 'active' });
      return {
        ...c,
        moduleCount: modules.length,
        lessonCount: lessons.length,
        enrolmentsCount,
        modules: modules.map((m: Record<string, unknown>) => ({
          ...m,
          lessons: lessons.filter((l: Record<string, unknown>) => String(l.moduleId) === String(m._id)),
        })),
      };
    })
  );
  res.json({ courses: enriched });
});

router.post('/courses', async (req, res) => {
  const raw = req.body || {};
  const parsed = courseWriteSchema.safeParse({
    ...raw,
    price: Number(raw.price ?? 0),
    order: Number(raw.order ?? 0),
  });
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid course details.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const d = parsed.data;
  const slug = slugify(d.slug || d.title);
  if (!slug) return res.status(400).json({ error: 'Valid course title or slug is required.' });

  const clash = await Course.findOne({ slug }).lean();
  if (clash) {
    return res.status(409).json({ error: `A course with slug "${slug}" already exists.` });
  }

  const course = await Course.create({
    title: stripHtmlTags(d.title),
    slug,
    shortDescription: stripHtmlTags(d.shortDescription),
    fullDescription: d.fullDescription,
    coverImage: d.coverImage,
    price: d.price,
    currency: d.currency,
    objectives: d.objectives.map(stripHtmlTags).filter(Boolean),
    outcomes: d.outcomes.map(stripHtmlTags).filter(Boolean),
    published: d.published,
    order: d.order,
    seoTitle: stripHtmlTags(d.seoTitle),
    seoDescription: stripHtmlTags(d.seoDescription),
    canonicalUrl: d.canonicalUrl,
    ogImage: d.ogImage,
    noIndex: d.noIndex,
    focusKeyword: stripHtmlTags(d.focusKeyword),
  });

  await logAdminActivity(req.user!, 'create_course', 'Course', course._id.toString(), course.title);
  res.status(201).json({ course });
});

router.patch('/courses/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid course identifier.' });
  }
  const raw = req.body || {};
  const candidate: Record<string, unknown> = { ...raw };
  if (raw.price !== undefined) candidate.price = Number(raw.price);
  if (raw.order !== undefined) candidate.order = Number(raw.order);

  const parsed = coursePatchSchema.safeParse(candidate);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid course update.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const d = parsed.data;
  const update: Record<string, unknown> = {};
  if (d.title !== undefined) update.title = stripHtmlTags(d.title);
  if (d.slug !== undefined && d.slug) update.slug = slugify(d.slug);
  if (d.shortDescription !== undefined) update.shortDescription = stripHtmlTags(d.shortDescription);
  if (d.fullDescription !== undefined) update.fullDescription = d.fullDescription;
  if (d.coverImage !== undefined) update.coverImage = d.coverImage;
  if (d.price !== undefined) update.price = d.price;
  if (d.currency !== undefined) update.currency = d.currency;
  if (d.objectives !== undefined) update.objectives = d.objectives.map(stripHtmlTags).filter(Boolean);
  if (d.outcomes !== undefined) update.outcomes = d.outcomes.map(stripHtmlTags).filter(Boolean);
  if (d.published !== undefined) update.published = d.published;
  if (d.order !== undefined) update.order = d.order;
  if (d.seoTitle !== undefined) update.seoTitle = stripHtmlTags(d.seoTitle);
  if (d.seoDescription !== undefined) update.seoDescription = stripHtmlTags(d.seoDescription);
  if (d.canonicalUrl !== undefined) update.canonicalUrl = d.canonicalUrl;
  if (d.ogImage !== undefined) update.ogImage = d.ogImage;
  if (d.noIndex !== undefined) update.noIndex = d.noIndex;
  if (d.focusKeyword !== undefined) update.focusKeyword = stripHtmlTags(d.focusKeyword);

  const updated = await Course.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
  if (!updated) return res.status(404).json({ error: 'Course not found.' });

  await logAdminActivity(req.user!, 'update_course', 'Course', updated._id.toString(), updated.title);
  res.json({ course: updated });
});

router.delete('/courses/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid course identifier.' });
  }
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  await Promise.all([
    Lesson.deleteMany({ courseId: course._id }),
    Module.deleteMany({ courseId: course._id }),
    Course.deleteOne({ _id: course._id }),
  ]);
  await logAdminActivity(req.user!, 'delete_course', 'Course', req.params.id, course.title);
  res.json({ ok: true });
});

router.post('/courses/:courseId/modules', async (req, res) => {
  if (!isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ error: 'Invalid course identifier.' });
  }
  const courseExists = await Course.exists({ _id: req.params.courseId });
  if (!courseExists) return res.status(404).json({ error: 'Course not found.' });

  const raw = req.body || {};
  const parsed = moduleWriteSchema.safeParse({
    ...raw,
    order: raw.order !== undefined ? Number(raw.order) : undefined,
  });
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid module details.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const count = await Module.countDocuments({ courseId: req.params.courseId });
  const mod = await Module.create({
    courseId: req.params.courseId,
    title: stripHtmlTags(parsed.data.title),
    description: stripHtmlTags(parsed.data.description),
    order: parsed.data.order ?? count + 1,
  });
  await logAdminActivity(req.user!, 'create_module', 'Module', mod._id.toString(), mod.title);
  res.status(201).json({ module: mod });
});

router.patch('/modules/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid module identifier.' });
  }
  const raw = req.body || {};
  const candidate: Record<string, unknown> = { ...raw };
  if (raw.order !== undefined) candidate.order = Number(raw.order);
  const parsed = modulePatchSchema.safeParse(candidate);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid module update.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }
  const update: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) update.title = stripHtmlTags(parsed.data.title);
  if (parsed.data.description !== undefined) update.description = stripHtmlTags(parsed.data.description);
  if (parsed.data.order !== undefined) update.order = parsed.data.order;

  const updated = await Module.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
  if (!updated) return res.status(404).json({ error: 'Module not found.' });
  res.json({ module: updated });
});

router.delete('/modules/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid module identifier.' });
  }
  await Promise.all([
    Lesson.deleteMany({ moduleId: req.params.id }),
    Module.deleteOne({ _id: req.params.id }),
  ]);
  res.json({ ok: true });
});

router.post('/courses/:courseId/lessons/bulk', async (req, res) => {
  if (!isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ error: 'Invalid course identifier.' });
  }
  const course = await Course.findById(req.params.courseId).lean();
  if (!course) return res.status(404).json({ error: 'Course not found.' });

  const parsed = bulkLessonsWriteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid video lessons batch.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  let targetModuleId = parsed.data.moduleId;
  if (targetModuleId) {
    const existingMod = await Module.findOne({
      _id: targetModuleId,
      courseId: req.params.courseId,
    }).lean();
    if (!existingMod) {
      return res.status(404).json({ error: 'Selected module not found for this course.' });
    }
  } else {
    const firstMod = await Module.findOne({ courseId: req.params.courseId })
      .sort({ order: 1 })
      .lean();
    if (firstMod) {
      targetModuleId = String((firstMod as { _id: unknown })._id);
    } else {
      const createdMod = await Module.create({
        courseId: req.params.courseId,
        title: 'Course Videos',
        description: '',
        order: 1,
      });
      targetModuleId = createdMod._id.toString();
    }
  }

  const existingCount = await Lesson.countDocuments({ moduleId: targetModuleId });
  const createdLessons = await Promise.all(
    parsed.data.lessons.map((item, idx) =>
      Lesson.create({
        courseId: req.params.courseId,
        moduleId: targetModuleId,
        title: stripHtmlTags(item.title),
        notes: item.notes,
        youtubeUrl: item.youtubeUrl,
        duration: stripHtmlTags(item.duration),
        order: existingCount + idx + 1,
        published: item.published,
      })
    )
  );

  await logAdminActivity(
    req.user!,
    'bulk_create_lessons',
    'Course',
    req.params.courseId,
    `Added ${createdLessons.length} sub-video(s) to course`
  );

  res.status(201).json({ lessons: createdLessons, moduleId: targetModuleId });
});

router.post('/modules/:moduleId/lessons', async (req, res) => {
  if (!isValidObjectId(req.params.moduleId)) {
    return res.status(400).json({ error: 'Invalid module identifier.' });
  }
  const mod = await Module.findById(req.params.moduleId).lean();
  if (!mod) return res.status(404).json({ error: 'Module not found.' });

  const raw = req.body || {};
  const parsed = lessonWriteSchema.safeParse({
    ...raw,
    order: raw.order !== undefined ? Number(raw.order) : undefined,
  });
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid lesson details.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const count = await Lesson.countDocuments({ moduleId: req.params.moduleId });
  const lesson = await Lesson.create({
    courseId: (mod as { courseId: unknown }).courseId,
    moduleId: req.params.moduleId,
    title: stripHtmlTags(parsed.data.title),
    notes: parsed.data.notes,
    youtubeUrl: parsed.data.youtubeUrl,
    duration: stripHtmlTags(parsed.data.duration),
    order: parsed.data.order ?? count + 1,
    published: parsed.data.published,
  });

  await logAdminActivity(req.user!, 'create_lesson', 'Lesson', lesson._id.toString(), lesson.title);
  res.status(201).json({ lesson });
});

router.patch('/lessons/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid lesson identifier.' });
  }
  const raw = req.body || {};
  const candidate: Record<string, unknown> = { ...raw };
  if (raw.order !== undefined) candidate.order = Number(raw.order);
  const parsed = lessonPatchSchema.safeParse(candidate);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid lesson update.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) update.title = stripHtmlTags(parsed.data.title);
  if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;
  if (parsed.data.youtubeUrl !== undefined) update.youtubeUrl = parsed.data.youtubeUrl;
  if (parsed.data.duration !== undefined) update.duration = stripHtmlTags(parsed.data.duration);
  if (parsed.data.order !== undefined) update.order = parsed.data.order;
  if (parsed.data.published !== undefined) update.published = parsed.data.published;

  const updated = await Lesson.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
  if (!updated) return res.status(404).json({ error: 'Lesson not found.' });
  await logAdminActivity(req.user!, 'update_lesson', 'Lesson', updated._id.toString(), updated.title);
  res.json({ lesson: updated });
});

router.delete('/lessons/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid lesson identifier.' });
  }
  await Promise.all([
    LessonProgress.deleteMany({ lessonId: req.params.id }),
    Lesson.deleteOne({ _id: req.params.id }),
  ]);
  res.json({ ok: true });
});

// 3. Learner Management
router.get('/learners', async (req, res) => {
  const search = String(req.query.q || '').trim().toLowerCase();
  const [learners, courses] = await Promise.all([
    User.find({ role: 'learner' })
      .select('_id name email phone organization active createdAt')
      .sort({ createdAt: -1 })
      .lean(),
    Course.find({})
      .select('_id title slug published price currency')
      .sort({ order: 1, createdAt: -1 })
      .lean(),
  ]);

  const filtered = search
    ? learners.filter(
        (l: Record<string, unknown>) =>
          String(l.name).toLowerCase().includes(search) ||
          String(l.email).toLowerCase().includes(search)
      )
    : learners;

  const enriched = await Promise.all(
    filtered.map(async (l: Record<string, unknown>) => {
      const [enrolments, completedLessons] = await Promise.all([
        Enrolment.find({ userId: l._id, status: 'active' }).populate('courseId', 'title slug').lean(),
        LessonProgress.countDocuments({ userId: l._id, completed: true }),
      ]);
      return { ...l, enrolments, completedLessons };
    })
  );

  res.json({ learners: enriched, courses });
});

router.patch('/learners/:id/status', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid learner identifier.' });
  }
  const active = Boolean(req.body?.active);
  const updated = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'learner' },
    { $set: { active } },
    { new: true }
  ).select('_id name email active');
  if (!updated) return res.status(404).json({ error: 'Learner not found.' });
  await logAdminActivity(
    req.user!,
    active ? 'activate_learner' : 'deactivate_learner',
    'User',
    req.params.id,
    updated.email
  );
  res.json({ learner: updated });
});

router.post('/learners/:id/enrol', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid learner identifier.' });
  }
  const parsed = learnerEnrolAssignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Valid course ID is required.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const [learner, course] = await Promise.all([
    User.findOne({ _id: req.params.id, role: 'learner' }).select('_id name email').lean(),
    Course.findById(parsed.data.courseId).select('_id title slug').lean(),
  ]);

  if (!learner) return res.status(404).json({ error: 'Learner not found.' });
  if (!course) return res.status(404).json({ error: 'Course not found.' });

  const l = learner as { _id: unknown; name: string; email: string };
  const c = course as { _id: unknown; title: string; slug: string };

  const enrolment = await Enrolment.findOneAndUpdate(
    { userId: l._id, courseId: c._id },
    {
      userId: l._id,
      courseId: c._id,
      status: 'active',
      activatedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  await Promise.all([
    Notification.create({
      userId: l._id,
      targetRole: 'learner',
      title: `Enrolled in ${c.title}`,
      message: `An administrator granted you access to "${c.title}".`,
      link: `/learner/courses/${c.slug}`,
    }),
    logAdminActivity(
      req.user!,
      'admin_enroll_learner',
      'Enrolment',
      String(enrolment._id),
      `${l.email} -> ${c.title}`
    ),
  ]);

  res.json({ ok: true, enrolment });
});

router.delete('/learners/:id/enrolments/:courseId', async (req, res) => {
  const { id, courseId } = req.params;
  if (!isValidObjectId(id) || !isValidObjectId(courseId)) {
    return res.status(400).json({ error: 'Invalid identifier.' });
  }
  const [learner, course] = await Promise.all([
    User.findOne({ _id: id, role: 'learner' }).select('_id name email').lean(),
    Course.findById(courseId).select('_id title').lean(),
  ]);

  if (!learner) return res.status(404).json({ error: 'Learner not found.' });

  const enrolment = await Enrolment.findOneAndUpdate(
    { userId: id, courseId, status: 'active' },
    { $set: { status: 'revoked' } },
    { new: true }
  );

  if (!enrolment) {
    return res.status(404).json({ error: 'Active enrolment not found for this course.' });
  }

  const l = learner as { email: string };
  const cTitle = (course as { title?: string } | null)?.title || courseId;

  await logAdminActivity(
    req.user!,
    'admin_unenroll_learner',
    'Enrolment',
    String(enrolment._id),
    `${l.email} -X ${cTitle}`
  );

  res.json({ ok: true });
});

router.delete('/learners/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid learner identifier.' });
  }
  const learner = await User.findOne({ _id: req.params.id, role: 'learner' })
    .select('_id name email role')
    .lean();
  if (!learner) {
    return res.status(404).json({ error: 'Learner not found.' });
  }

  const l = learner as { _id: unknown; email: string };
  const tickets = await SupportTicket.find({ userId: l._id }).select('_id').lean();
  const ticketIds = tickets.map((t: { _id: unknown }) => t._id);

  await Promise.all([
    Enrolment.deleteMany({ userId: l._id }),
    LessonProgress.deleteMany({ userId: l._id }),
    PasswordResetToken.deleteMany({ userId: l._id }),
    Notification.deleteMany({ userId: l._id }),
    ...(ticketIds.length > 0 ? [SupportMessage.deleteMany({ ticketId: { $in: ticketIds } })] : []),
    SupportTicket.deleteMany({ userId: l._id }),
    User.deleteOne({ _id: l._id, role: 'learner' }),
  ]);

  await logAdminActivity(req.user!, 'remove_learner', 'User', req.params.id, l.email);
  res.json({ ok: true });
});

// 4. Payments & Refunds Management
router.get('/payments', async (req, res) => {
  const status = String(req.query.status || '').trim();
  const allowedStatuses = new Set(['pending', 'success', 'failed', 'abandoned', 'refunded']);
  const filter: Record<string, unknown> = {};
  if (status && status !== 'All' && allowedStatuses.has(status)) {
    filter.status = status;
  }

  const payments = await Payment.find(filter)
    .select('-processedEvents')
    .populate('userId', 'name email')
    .populate('courseId', 'title slug')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ payments });
});

router.post('/payments/:id/refund', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid payment identifier.' });
  }
  const raw = req.body || {};
  const parsed = paymentRefundSchema.safeParse({
    reason: raw.reason,
    amount: raw.amount !== undefined && raw.amount !== '' ? Number(raw.amount) : undefined,
  });
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid refund details.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const payment = await Payment.findById(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment record not found.' });

  if (payment.status === 'refunded') {
    return res.status(400).json({ error: 'This payment has already been refunded.' });
  }
  if (payment.status !== 'success') {
    return res.status(400).json({ error: 'Only verified successful payments can be refunded.' });
  }
  if (payment.provider === 'coupon' || payment.amount <= 0) {
    return res.status(400).json({
      error: 'Zero-amount coupon enrolments have no monetary charge to refund. Revoke learner access from Learner Management instead.',
    });
  }

  const refundAmount = parsed.data.amount !== undefined ? parsed.data.amount : payment.amount;
  if (refundAmount > payment.amount) {
    return res.status(400).json({
      error: `Refund amount (${payment.currency} ${refundAmount}) cannot exceed paid amount (${payment.currency} ${payment.amount}).`,
    });
  }

  const amountMinor = Math.round(refundAmount * 100);
  const paystackRefund = await refundPaystackTransaction({
    reference: payment.reference,
    amountMinor,
    merchantNote: stripHtmlTags(parsed.data.reason),
  });

  if (!paystackRefund.ok) {
    const status = paystackRefund.configured ? 502 : 503;
    return res.status(status).json({
      error: paystackRefund.error || 'Paystack could not process the refund.',
    });
  }

  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'success' },
    {
      $set: {
        status: 'refunded',
        refundAmount,
        refundReference: paystackRefund.refundReference || `RF-${payment.reference}`,
        refundReason: stripHtmlTags(parsed.data.reason),
        refundedAt: new Date(),
        refundedBy: req.user!.id,
      },
      $addToSet: { processedEvents: `admin_refund:${payment.reference}` },
    },
    { new: true }
  )
    .populate('userId', 'name email')
    .populate('courseId', 'title slug');

  if (!updated) {
    return res.status(409).json({ error: 'Payment state changed concurrently. Refresh and try again.' });
  }

  await Enrolment.updateOne(
    { userId: payment.userId, courseId: payment.courseId },
    { $set: { status: 'revoked' } }
  );

  const populatedCourse = (updated.courseId as { title?: string } | null)?.title || 'Course';
  const populatedUser = updated.userId as { _id?: unknown; name?: string; email?: string } | null;

  await Promise.all([
    Notification.create({
      userId: payment.userId,
      targetRole: 'learner',
      title: `Refund Issued (${payment.currency} ${refundAmount})`,
      message: `Your payment (${payment.reference}) for "${populatedCourse}" has been refunded and course access revoked.`,
      link: '/learner?tab=payments',
    }),
    logAdminActivity(
      req.user!,
      'refund_payment',
      'Payment',
      payment._id.toString(),
      `Refunded ${payment.currency} ${refundAmount} for ${payment.reference} — ${stripHtmlTags(parsed.data.reason)}`
    ),
  ]);

  if (populatedUser?.email) {
    await sendTransactionalEmail({
      to: populatedUser.email,
      subject: `Refund Processed: ${payment.reference} — NexaFlow Learn`,
      text: `Hello ${populatedUser.name || 'Learner'},\n\nA refund of ${payment.currency} ${refundAmount} has been issued for your payment reference ${payment.reference} ("${populatedCourse}").\nReason: ${stripHtmlTags(parsed.data.reason)}\n\nPlease allow your bank or card issuer a few business days to post the credit.`,
    });
  }

  res.json({ ok: true, payment: serializePayment(updated) });
});

// 5. Lead CRM
router.get('/leads', async (req, res) => {
  const { q, status, interestType, source, dateFrom, dateTo } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status && status !== 'All') filter.status = status;
  if (interestType && interestType !== 'All') filter.interestType = interestType;
  if (source && source !== 'All') filter.source = source;
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) {
      const df = new Date(dateFrom);
      if (!Number.isNaN(df.getTime())) createdAt.$gte = df;
    }
    if (dateTo) {
      const dt = new Date(`${dateTo}T23:59:59.999Z`);
      if (!Number.isNaN(dt.getTime())) createdAt.$lte = dt;
    }
    if (Object.keys(createdAt).length > 0) filter.createdAt = createdAt;
  }

  let leads = await Lead.find(filter).sort({ createdAt: -1 }).lean();
  if (q && q.trim()) {
    const query = q.trim().toLowerCase();
    leads = leads.filter(
      (l: Record<string, unknown>) =>
        String(l.fullName).toLowerCase().includes(query) ||
        String(l.email).toLowerCase().includes(query) ||
        String(l.company || '').toLowerCase().includes(query) ||
        String(l.interestName).toLowerCase().includes(query)
    );
  }

  const allLeads = await Lead.find().lean();
  const now = new Date();
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byInterest: Record<string, number> = {};
  let followUpsDue = 0;

  for (const item of allLeads as Array<Record<string, unknown>>) {
    const st = String(item.status || 'New');
    const src = String(item.source || 'direct');
    const intr = String(item.interestName || 'General');
    byStatus[st] = (byStatus[st] || 0) + 1;
    bySource[src] = (bySource[src] || 0) + 1;
    byInterest[intr] = (byInterest[intr] || 0) + 1;
    if (
      item.followUpDate &&
      new Date(item.followUpDate as string) <= now &&
      st !== 'Converted' &&
      st !== 'Lost'
    ) {
      followUpsDue++;
    }
  }

  const total = allLeads.length;
  const converted = byStatus['Converted'] || 0;

  res.json({
    leads,
    crmMetrics: {
      total,
      newCount: byStatus['New'] || 0,
      qualifiedCount: byStatus['Qualified'] || 0,
      convertedCount: converted,
      conversionRate: total > 0 ? Number(((converted / total) * 100).toFixed(1)) : 0,
      followUpsDue,
      bySource,
      byInterest,
    },
  });
});

router.get('/leads/export.csv', async (req, res) => {
  const rawIds =
    typeof req.query.ids === 'string' && req.query.ids
      ? req.query.ids
          .split(',')
          .map((s) => s.trim())
          .filter((s) => isValidObjectId(s))
      : null;
  if (typeof req.query.ids === 'string' && req.query.ids && (!rawIds || rawIds.length === 0)) {
    return res.status(400).json({ error: 'Invalid lead identifiers.' });
  }
  const filter = rawIds ? { _id: { $in: rawIds } } : {};
  const leads = await Lead.find(filter).sort({ createdAt: -1 }).lean();

  const headers = [
    'Date',
    'Full Name',
    'Email',
    'Phone',
    'Company',
    'Interest Type',
    'Interest Name',
    'Status',
    'Source',
    'UTM Source',
    'UTM Medium',
    'UTM Campaign',
    'Preferred Contact',
    'Budget',
    'Follow Up Date',
    'Description',
  ];

  const rows = (leads as Array<Record<string, unknown>>).map((l) =>
    [
      l.createdAt ? new Date(String(l.createdAt)).toISOString() : '',
      l.fullName,
      l.email,
      l.phone,
      l.company,
      l.interestType,
      l.interestName,
      l.status,
      l.source,
      l.utmSource,
      l.utmMedium,
      l.utmCampaign,
      l.preferredContact,
      l.budgetRange,
      l.followUpDate ? new Date(String(l.followUpDate)).toISOString().slice(0, 10) : '',
      l.description,
    ]
      .map(sanitizeCsvCell)
      .join(',')
  );

  await logAdminActivity(req.user!, 'export_leads_csv', 'Lead', '', `Exported ${leads.length} leads`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nexaflow-leads.csv"');
  res.send([headers.join(','), ...rows].join('\n'));
});

router.get('/leads/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid lead identifier.' });
  }
  const lead = await Lead.findById(req.params.id).lean();
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });
  const activities = await LeadActivity.find({ leadId: req.params.id }).sort({ createdAt: -1 }).lean();
  res.json({ lead, activities });
});

router.patch('/leads/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid lead identifier.' });
  }
  const parsed = leadUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid lead update.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });

  const { status, followUpDate, outcomeReason } = parsed.data;
  const previousStatus = lead.status;

  if (status) lead.status = status;
  if (followUpDate !== undefined) {
    lead.followUpDate = followUpDate ? new Date(followUpDate) : undefined;
  }
  if (outcomeReason !== undefined) {
    lead.outcomeReason = stripHtmlTags(outcomeReason);
  }
  await lead.save();

  if (status && status !== previousStatus) {
    await LeadActivity.create({
      leadId: lead._id,
      adminId: req.user!.id,
      adminName: req.user!.name,
      type: 'status_change',
      content: `Status changed from ${previousStatus} to ${status}${
        lead.outcomeReason ? ` (${lead.outcomeReason})` : ''
      }.`,
    });
  }

  await logAdminActivity(req.user!, 'update_lead', 'Lead', lead._id.toString(), `${lead.fullName}: ${lead.status}`);
  res.json({ lead });
});

router.post('/leads/:id/activities', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid lead identifier.' });
  }
  const leadExists = await Lead.exists({ _id: req.params.id });
  if (!leadExists) return res.status(404).json({ error: 'Lead not found.' });

  const parsed = leadActivityWriteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid activity note.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const activity = await LeadActivity.create({
    leadId: req.params.id,
    adminId: req.user!.id,
    adminName: req.user!.name,
    type: parsed.data.type,
    content: stripHtmlTags(parsed.data.content),
  });
  res.status(201).json({ activity });
});

// 6. Products Management
router.get('/products', async (_req, res) => {
  const products = await Product.find().sort({ order: 1, createdAt: -1 }).lean();
  res.json({ products });
});

router.post('/products', async (req, res) => {
  const raw = req.body || {};
  const parsed = productWriteSchema.safeParse({
    ...raw,
    order: Number(raw.order ?? 0),
  });
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid product data.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const d = parsed.data;
  const name = stripHtmlTags(d.name);
  const slug = slugify(d.slug || name);
  const clash = await Product.findOne({ slug }).lean();
  if (clash) return res.status(409).json({ error: `Product slug "${slug}" already exists.` });

  const product = await Product.create({
    name,
    slug,
    category: stripHtmlTags(d.category),
    shortDescription: stripHtmlTags(d.shortDescription),
    fullDescription: d.fullDescription,
    features: d.features.map(stripHtmlTags).filter(Boolean),
    benefits: d.benefits.map(stripHtmlTags).filter(Boolean),
    images: d.images.filter(Boolean),
    demoLink: d.demoLink,
    pricingStatus: stripHtmlTags(d.pricingStatus),
    published: d.published,
    order: d.order,
  });
  await logAdminActivity(req.user!, 'create_product', 'Product', product._id.toString(), product.name);
  res.status(201).json({ product });
});

router.patch('/products/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid product identifier.' });
  }
  const raw = req.body || {};
  const candidate: Record<string, unknown> = { ...raw };
  if (raw.order !== undefined) candidate.order = Number(raw.order);
  const parsed = productPatchSchema.safeParse(candidate);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid product update.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const d = parsed.data;
  const update: Record<string, unknown> = {};
  if (d.name !== undefined) update.name = stripHtmlTags(d.name);
  if (d.slug !== undefined && d.slug) update.slug = slugify(d.slug);
  if (d.category !== undefined) update.category = stripHtmlTags(d.category);
  if (d.shortDescription !== undefined) update.shortDescription = stripHtmlTags(d.shortDescription);
  if (d.fullDescription !== undefined) update.fullDescription = d.fullDescription;
  if (d.features !== undefined) update.features = d.features.map(stripHtmlTags).filter(Boolean);
  if (d.benefits !== undefined) update.benefits = d.benefits.map(stripHtmlTags).filter(Boolean);
  if (d.images !== undefined) update.images = d.images.filter(Boolean);
  if (d.demoLink !== undefined) update.demoLink = d.demoLink;
  if (d.pricingStatus !== undefined) update.pricingStatus = stripHtmlTags(d.pricingStatus);
  if (d.published !== undefined) update.published = d.published;
  if (d.order !== undefined) update.order = d.order;

  const updated = await Product.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
  if (!updated) return res.status(404).json({ error: 'Product not found.' });
  await logAdminActivity(req.user!, 'update_product', 'Product', updated._id.toString(), updated.name);
  res.json({ product: updated });
});

router.delete('/products/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid product identifier.' });
  }
  await Product.deleteOne({ _id: req.params.id });
  await logAdminActivity(req.user!, 'delete_product', 'Product', req.params.id, '');
  res.json({ ok: true });
});

// 7. Services Management
router.get('/services', async (_req, res) => {
  const services = await Service.find().sort({ order: 1, createdAt: 1 }).lean();
  res.json({ services });
});

router.post('/services', async (req, res) => {
  const raw = req.body || {};
  const parsed = serviceWriteSchema.safeParse({
    ...raw,
    order: Number(raw.order ?? 0),
  });
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid service data.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const d = parsed.data;
  const name = stripHtmlTags(d.name);
  const slug = slugify(d.slug || name);
  const clash = await Service.findOne({ slug }).lean();
  if (clash) return res.status(409).json({ error: `Service slug "${slug}" already exists.` });

  const service = await Service.create({
    name,
    slug,
    shortDescription: stripHtmlTags(d.shortDescription),
    overview: d.overview,
    problemsAddressed: d.problemsAddressed.map(stripHtmlTags).filter(Boolean),
    deliverables: d.deliverables.map(stripHtmlTags).filter(Boolean),
    ctaLabel: stripHtmlTags(d.ctaLabel),
    coverImage: d.coverImage,
    published: d.published,
    order: d.order,
  });
  await logAdminActivity(req.user!, 'create_service', 'Service', service._id.toString(), service.name);
  res.status(201).json({ service });
});

router.patch('/services/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid service identifier.' });
  }
  const raw = req.body || {};
  const candidate: Record<string, unknown> = { ...raw };
  if (raw.order !== undefined) candidate.order = Number(raw.order);
  const parsed = servicePatchSchema.safeParse(candidate);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid service update.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const d = parsed.data;
  const update: Record<string, unknown> = {};
  if (d.name !== undefined) update.name = stripHtmlTags(d.name);
  if (d.slug !== undefined && d.slug) update.slug = slugify(d.slug);
  if (d.shortDescription !== undefined) update.shortDescription = stripHtmlTags(d.shortDescription);
  if (d.overview !== undefined) update.overview = d.overview;
  if (d.problemsAddressed !== undefined)
    update.problemsAddressed = d.problemsAddressed.map(stripHtmlTags).filter(Boolean);
  if (d.deliverables !== undefined) update.deliverables = d.deliverables.map(stripHtmlTags).filter(Boolean);
  if (d.ctaLabel !== undefined) update.ctaLabel = stripHtmlTags(d.ctaLabel);
  if (d.coverImage !== undefined) update.coverImage = d.coverImage;
  if (d.published !== undefined) update.published = d.published;
  if (d.order !== undefined) update.order = d.order;

  const updated = await Service.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
  if (!updated) return res.status(404).json({ error: 'Service not found.' });
  await logAdminActivity(req.user!, 'update_service', 'Service', updated._id.toString(), updated.name);
  res.json({ service: updated });
});

router.delete('/services/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid service identifier.' });
  }
  await Service.deleteOne({ _id: req.params.id });
  await logAdminActivity(req.user!, 'delete_service', 'Service', req.params.id, '');
  res.json({ ok: true });
});

// 8. Blog / Insights CMS
router.get('/articles', async (_req, res) => {
  const articles = await Article.find().sort({ updatedAt: -1 }).lean();
  res.json({ articles });
});

router.post('/articles', async (req, res) => {
  const parsed = articleWriteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid article payload.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const d = parsed.data;
  const title = stripHtmlTags(d.title);
  const slug = slugify(d.slug || title);
  const clash = await Article.findOne({ slug }).lean();
  if (clash) return res.status(409).json({ error: `Article slug "${slug}" already exists.` });

  const words = d.content.trim().split(/\s+/).filter(Boolean).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(words / 200));

  const article = await Article.create({
    title,
    slug,
    excerpt: stripHtmlTags(d.excerpt),
    content: d.content,
    featuredImage: d.featuredImage,
    category: stripHtmlTags(d.category),
    tags: d.tags.map(stripHtmlTags).filter(Boolean),
    authorName: stripHtmlTags(d.authorName),
    status: d.status,
    ctaLabel: stripHtmlTags(d.ctaLabel),
    ctaHref: d.ctaHref,
    readingTimeMinutes,
    publishedAt: d.status === 'published' ? new Date() : undefined,
  });

  await logAdminActivity(req.user!, 'create_article', 'Article', article._id.toString(), article.title);
  res.status(201).json({ article });
});

router.patch('/articles/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid article identifier.' });
  }
  const parsed = articlePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid article update.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const d = parsed.data;
  const update: Record<string, unknown> = {};
  if (d.title !== undefined) update.title = stripHtmlTags(d.title);
  if (d.slug !== undefined && d.slug) update.slug = slugify(d.slug);
  if (d.excerpt !== undefined) update.excerpt = stripHtmlTags(d.excerpt);
  if (d.content !== undefined) {
    update.content = d.content;
    const words = d.content.trim().split(/\s+/).filter(Boolean).length;
    update.readingTimeMinutes = Math.max(1, Math.ceil(words / 200));
  }
  if (d.featuredImage !== undefined) update.featuredImage = d.featuredImage;
  if (d.category !== undefined) update.category = stripHtmlTags(d.category);
  if (d.tags !== undefined) update.tags = d.tags.map(stripHtmlTags).filter(Boolean);
  if (d.authorName !== undefined) update.authorName = stripHtmlTags(d.authorName);
  if (d.status !== undefined) {
    update.status = d.status;
    if (d.status === 'published') update.publishedAt = new Date();
  }
  if (d.ctaLabel !== undefined) update.ctaLabel = stripHtmlTags(d.ctaLabel);
  if (d.ctaHref !== undefined) update.ctaHref = d.ctaHref;

  const updated = await Article.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
  if (!updated) return res.status(404).json({ error: 'Article not found.' });
  await logAdminActivity(req.user!, 'update_article', 'Article', updated._id.toString(), updated.title);
  res.json({ article: updated });
});

router.delete('/articles/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid article identifier.' });
  }
  await Article.deleteOne({ _id: req.params.id });
  await logAdminActivity(req.user!, 'delete_article', 'Article', req.params.id, '');
  res.json({ ok: true });
});

// 9. Support Management
router.get('/tickets', async (req, res) => {
  const status = String(req.query.status || '');
  const filter = status && status !== 'All' ? { status } : {};
  const tickets = await SupportTicket.find(filter)
    .populate('userId', 'name email')
    .populate('courseId', 'title slug')
    .sort({ updatedAt: -1 })
    .lean();
  res.json({ tickets });
});

router.get('/tickets/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ticket identifier.' });
  }
  const ticket = await SupportTicket.findById(req.params.id)
    .populate('userId', 'name email')
    .populate('courseId', 'title slug')
    .lean();
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  const messages = await SupportMessage.find({ ticketId: req.params.id }).sort({ createdAt: 1 }).lean();
  res.json({ ticket, messages });
});

router.patch('/tickets/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ticket identifier.' });
  }
  const parsed = ticketStatusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid status.' });
  }
  const updated = await SupportTicket.findByIdAndUpdate(
    req.params.id,
    { $set: { status: parsed.data.status } },
    { new: true }
  );
  if (!updated) return res.status(404).json({ error: 'Ticket not found.' });
  await logAdminActivity(
    req.user!,
    'update_ticket_status',
    'SupportTicket',
    updated._id.toString(),
    `${updated.referenceNumber} -> ${parsed.data.status}`
  );
  res.json({ ticket: updated });
});

router.post('/tickets/:id/messages', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ticket identifier.' });
  }
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  const messageText = stripHtmlTags(String(req.body?.message || ''));
  if (messageText.length < 2 || messageText.length > 4000) {
    return res.status(400).json({ error: 'Reply must be between 2 and 4000 characters.' });
  }

  const msg = await SupportMessage.create({
    ticketId: ticket._id,
    senderId: req.user!.id,
    senderRole: 'admin',
    senderName: req.user!.name,
    message: messageText,
  });

  if (ticket.status === 'Open' || ticket.status === 'In Progress') {
    ticket.status = 'Answered';
    await ticket.save();
  }

  await Notification.create({
    userId: ticket.userId,
    targetRole: 'learner',
    title: `Support Reply: ${ticket.referenceNumber}`,
    message: `An instructor/administrator replied to "${ticket.subject}".`,
    link: `/learner?tab=support`,
  });

  await logAdminActivity(
    req.user!,
    'reply_ticket',
    'SupportTicket',
    ticket._id.toString(),
    ticket.referenceNumber
  );

  res.status(201).json({ message: msg, ticket });
});

// 10. Website, Business & Legal Settings
router.get('/settings', async (_req, res) => {
  const settings = await SiteSettings.findOne({ key: 'main' }).lean();
  res.json({
    settings: settings ? { ...DEFAULT_SITE_SETTINGS, ...settings } : DEFAULT_SITE_SETTINGS,
  });
});

router.put('/settings', async (req, res) => {
  const raw = req.body || {};
  const candidate: Record<string, unknown> = { ...raw };
  if (raw.retentionDays !== undefined) candidate.retentionDays = Number(raw.retentionDays);
  const parsed = siteSettingsWriteSchema.safeParse(candidate);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid settings payload.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const d = parsed.data;
  const update: Record<string, unknown> = {};
  if (d.businessName !== undefined) update.businessName = stripHtmlTags(d.businessName);
  if (d.descriptor !== undefined) update.descriptor = stripHtmlTags(d.descriptor);
  if (d.tagline !== undefined) update.tagline = stripHtmlTags(d.tagline);
  if (d.email !== undefined) update.email = d.email;
  if (d.phone !== undefined) update.phone = stripHtmlTags(d.phone);
  if (d.whatsapp !== undefined) update.whatsapp = stripHtmlTags(d.whatsapp);
  if (d.generalLocation !== undefined) update.generalLocation = stripHtmlTags(d.generalLocation);
  if (d.serviceAreas !== undefined) update.serviceAreas = stripHtmlTags(d.serviceAreas);
  if (d.businessHours !== undefined) update.businessHours = stripHtmlTags(d.businessHours);
  if (d.socialLinks !== undefined) update.socialLinks = d.socialLinks;
  if (d.googleBusinessProfileUrl !== undefined) update.googleBusinessProfileUrl = d.googleBusinessProfileUrl;
  if (d.heroHeadline !== undefined) update.heroHeadline = stripHtmlTags(d.heroHeadline);
  if (d.heroSubheadline !== undefined) update.heroSubheadline = stripHtmlTags(d.heroSubheadline);
  if (d.aboutIntro !== undefined) update.aboutIntro = stripHtmlTags(d.aboutIntro);
  if (d.mission !== undefined) update.mission = stripHtmlTags(d.mission);
  if (d.vision !== undefined) update.vision = stripHtmlTags(d.vision);
  if (d.values !== undefined) update.values = d.values.map(stripHtmlTags).filter(Boolean);
  if (d.legalPrivacy !== undefined) update.legalPrivacy = d.legalPrivacy;
  if (d.legalTerms !== undefined) update.legalTerms = d.legalTerms;
  if (d.legalCookies !== undefined) update.legalCookies = d.legalCookies;
  if (d.legalRefund !== undefined) update.legalRefund = d.legalRefund;
  if (d.gaMeasurementId !== undefined) update.gaMeasurementId = d.gaMeasurementId.toUpperCase();
  if (d.gscVerificationTag !== undefined) update.gscVerificationTag = stripHtmlTags(d.gscVerificationTag);
  if (d.retentionDays !== undefined) update.retentionDays = d.retentionDays;
  if (d.seoSiteTitle !== undefined) update.seoSiteTitle = stripHtmlTags(d.seoSiteTitle);
  if (d.seoTitleSuffix !== undefined) update.seoTitleSuffix = stripHtmlTags(d.seoTitleSuffix);
  if (d.seoDefaultDescription !== undefined) update.seoDefaultDescription = stripHtmlTags(d.seoDefaultDescription);
  if (d.seoDefaultKeywords !== undefined) update.seoDefaultKeywords = stripHtmlTags(d.seoDefaultKeywords);
  if (d.seoOgTitle !== undefined) update.seoOgTitle = stripHtmlTags(d.seoOgTitle);
  if (d.seoOgDescription !== undefined) update.seoOgDescription = stripHtmlTags(d.seoOgDescription);
  if (d.seoOgImage !== undefined) update.seoOgImage = d.seoOgImage;
  if (d.seoTwitterCard !== undefined) update.seoTwitterCard = d.seoTwitterCard;
  if (d.seoTwitterSite !== undefined) update.seoTwitterSite = stripHtmlTags(d.seoTwitterSite);
  if (d.seoCanonicalBaseUrl !== undefined) update.seoCanonicalBaseUrl = d.seoCanonicalBaseUrl;
  if (d.seoRobotsDefault !== undefined) update.seoRobotsDefault = d.seoRobotsDefault;
  if (d.seoStructuredDataEnabled !== undefined) update.seoStructuredDataEnabled = d.seoStructuredDataEnabled;

  const updated = await SiteSettings.findOneAndUpdate(
    { key: 'main' },
    { $set: update },
    { upsert: true, new: true }
  ).lean();

  await logAdminActivity(
    req.user!,
    'update_site_settings',
    'SiteSettings',
    'main',
    d.seoSiteTitle || d.seoOgImage ? 'Updated global SEO & site settings' : 'Updated site/business settings'
  );
  res.json({
    settings: updated ? { ...DEFAULT_SITE_SETTINGS, ...updated } : DEFAULT_SITE_SETTINGS,
  });
});

// 11. SEO Settings
router.get('/seo', async (_req, res) => {
  const existing = await SEOSettings.find().sort({ pageKey: 1 }).lean();
  const byKey = new Map<string, Record<string, unknown>>(
    existing.map((doc) => [String(doc.pageKey), doc as Record<string, unknown>])
  );
  const merged = DEFAULT_SEO_PAGES.map((def) => ({
    ...def,
    ...(byKey.get(def.pageKey) || {}),
  }));
  const defaultKeys = new Set(DEFAULT_SEO_PAGES.map((d) => d.pageKey));
  const customPages = existing.filter((doc) => !defaultKeys.has(String(doc.pageKey)));
  res.json({ seoPages: [...merged, ...customPages] });
});

router.put('/seo/:pageKey', async (req, res) => {
  const pageKey = slugify(req.params.pageKey) || req.params.pageKey.trim().toLowerCase();
  const parsed = seoPageUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid SEO settings payload.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }
  const payload = {
    pageKey,
    title: stripHtmlTags(parsed.data.title),
    description: stripHtmlTags(parsed.data.description),
    canonicalUrl: parsed.data.canonicalUrl,
    ogTitle: stripHtmlTags(parsed.data.ogTitle),
    ogDescription: stripHtmlTags(parsed.data.ogDescription),
    ogImage: parsed.data.ogImage,
    focusKeyword: stripHtmlTags(parsed.data.focusKeyword),
    noIndex: parsed.data.noIndex,
  };
  const updated = await SEOSettings.findOneAndUpdate(
    { pageKey },
    { $set: payload },
    { upsert: true, new: true }
  ).lean();
  await logAdminActivity(req.user!, 'update_seo', 'SEOSettings', pageKey, payload.title || pageKey);
  res.json({ seo: updated });
});

router.delete('/seo/:pageKey', async (req, res) => {
  const pageKey = req.params.pageKey.trim().toLowerCase();
  await SEOSettings.deleteOne({ pageKey });
  await logAdminActivity(req.user!, 'delete_seo_override', 'SEOSettings', pageKey, 'Reset to default');
  res.json({ ok: true });
});

// 12. Analytics Summary
router.get('/analytics', async (_req, res) => {
  const [byEvent, recentEvents, topPaths] = await Promise.all([
    AnalyticsEvent.aggregate([{ $group: { _id: '$eventType', count: { $sum: 1 } } }]),
    AnalyticsEvent.find().sort({ createdAt: -1 }).limit(25).lean(),
    AnalyticsEvent.aggregate([
      { $match: { eventType: 'page_view' } },
      { $group: { _id: '$path', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);
  res.json({ byEvent, recentEvents, topPaths });
});

// 13. Notifications & Audit Log
router.get('/notifications', async (_req, res) => {
  const notifications = await Notification.find({ targetRole: 'admin' })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json({ notifications });
});

router.patch('/notifications/:id/read', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid notification identifier.' });
  }
  await Notification.updateOne({ _id: req.params.id, targetRole: 'admin' }, { $set: { read: true } });
  res.json({ ok: true });
});

router.get('/audit-logs', async (_req, res) => {
  const logs = await AdminActivity.find().sort({ createdAt: -1 }).limit(100).lean();
  res.json({ logs });
});

// 14. Admin Access & Role Management (Super Admin only)
router.get('/admins', requireSuperAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const admins = await User.find({ role: { $in: ['admin', 'super_admin'] } })
    .select(
      '_id name email secondaryEmails role active authProviders googleId passwordHash createdAt updatedAt'
    )
    .sort({ createdAt: 1 })
    .lean();

  const mapped = admins.map((a: Record<string, unknown>) => ({
    _id: String(a._id),
    name: String(a.name || ''),
    email: String(a.email || ''),
    secondaryEmails: Array.isArray(a.secondaryEmails) ? (a.secondaryEmails as string[]) : [],
    role: String(a.role || 'admin'),
    active: Boolean(a.active),
    authProviders: Array.isArray(a.authProviders) ? (a.authProviders as string[]) : [],
    googleLinked: Boolean(a.googleId),
    hasPassword: Boolean(a.passwordHash),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));

  const filtered = q
    ? mapped.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.secondaryEmails.some((se) => se.toLowerCase().includes(q))
      )
    : mapped;

  res.json({ admins: filtered });
});

router.post('/admins', requireSuperAdmin, async (req, res) => {
  const parsed = adminCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid admin payload.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const secondaryEmails = Array.from(
    new Set(
      parsed.data.secondaryEmails.map((e) => e.toLowerCase()).filter((e) => e !== normalizedEmail)
    )
  );

  const existing = await User.findOne({
    $or: [
      { email: { $in: [normalizedEmail, ...secondaryEmails] } },
      { secondaryEmails: { $in: [normalizedEmail, ...secondaryEmails] } },
    ],
  });

  if (existing) {
    if (existing.role === 'admin' || existing.role === 'super_admin') {
      return res.status(409).json({
        error: `${existing.email} already has ${existing.role} access in MongoDB.`,
      });
    }

    if (parsed.data.name && parsed.data.name.trim().length >= 2) {
      existing.name = stripHtmlTags(parsed.data.name);
    }
    if (secondaryEmails.length > 0) {
      existing.secondaryEmails = Array.from(
        new Set([...(existing.secondaryEmails || []), ...secondaryEmails])
      ).filter((e) => e !== existing.email);
    }
    if (parsed.data.password) {
      existing.passwordHash = await bcrypt.hash(parsed.data.password, 12);
      if (!existing.authProviders.includes('local')) existing.authProviders.push('local');
    }
    existing.role = parsed.data.role;
    existing.active = true;
    await existing.save();

    await logAdminActivity(
      req.user!,
      'grant_admin_access',
      'User',
      existing._id.toString(),
      `Granted ${existing.role} access to existing user ${existing.email}`
    );

    return res.status(200).json({
      promoted: true,
      admin: {
        _id: existing._id.toString(),
        name: existing.name,
        email: existing.email,
        secondaryEmails: existing.secondaryEmails || [],
        role: existing.role,
        active: existing.active,
        authProviders: existing.authProviders || [],
        googleLinked: Boolean(existing.googleId),
        hasPassword: Boolean(existing.passwordHash),
        createdAt: existing.createdAt,
      },
    });
  }

  const resolvedName =
    parsed.data.name && parsed.data.name.trim().length >= 2
      ? stripHtmlTags(parsed.data.name)
      : normalizedEmail.split('@')[0];

  const passwordHash = parsed.data.password ? await bcrypt.hash(parsed.data.password, 12) : '';
  const created = await User.create({
    name: resolvedName,
    email: normalizedEmail,
    secondaryEmails,
    passwordHash,
    authProviders: parsed.data.password ? ['local'] : [],
    role: parsed.data.role,
    active: true,
  });

  await logAdminActivity(
    req.user!,
    'create_admin',
    'User',
    created._id.toString(),
    `Added ${created.email} (${created.role})`
  );

  res.status(201).json({
    promoted: false,
    admin: {
      _id: created._id.toString(),
      name: created.name,
      email: created.email,
      secondaryEmails: created.secondaryEmails || [],
      role: created.role,
      active: created.active,
      authProviders: created.authProviders || [],
      googleLinked: false,
      hasPassword: Boolean(created.passwordHash),
      createdAt: created.createdAt,
    },
  });
});

router.patch('/admins/:id', requireSuperAdmin, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid administrator identifier.' });
  }
  const parsed = adminUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid update payload.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const target = await User.findOne({
    _id: req.params.id,
    role: { $in: ['admin', 'super_admin'] },
  });
  if (!target) return res.status(404).json({ error: 'Administrator not found.' });

  const isSelf = String(target._id) === req.user!.id;
  if (isSelf && (parsed.data.active === false || (parsed.data.role && parsed.data.role !== target.role))) {
    return res
      .status(400)
      .json({ error: 'You cannot deactivate or demote your own active Super Admin session.' });
  }

  if (
    target.role === 'super_admin' &&
    (parsed.data.role === 'admin' || parsed.data.active === false)
  ) {
    const otherSuperAdmins = await User.countDocuments({
      _id: { $ne: target._id },
      role: 'super_admin',
      active: true,
    });
    if (otherSuperAdmins === 0) {
      return res.status(400).json({
        error: 'At least one active Super Administrator must remain in MongoDB.',
      });
    }
  }

  if (parsed.data.name) target.name = stripHtmlTags(parsed.data.name);

  if (parsed.data.email || parsed.data.secondaryEmails) {
    const nextPrimary = (parsed.data.email || target.email).toLowerCase();
    const nextSecondary = Array.from(
      new Set(
        (parsed.data.secondaryEmails ?? target.secondaryEmails ?? [])
          .map((e: string) => e.toLowerCase())
          .filter((e: string) => e && e !== nextPrimary)
      )
    );
    const conflict = await User.findOne({
      _id: { $ne: target._id },
      $or: [
        { email: { $in: [nextPrimary, ...nextSecondary] } },
        { secondaryEmails: { $in: [nextPrimary, ...nextSecondary] } },
      ],
    }).lean();
    if (conflict) {
      return res.status(409).json({ error: 'Email address already assigned to another account.' });
    }
    target.email = nextPrimary;
    target.secondaryEmails = nextSecondary;
  }

  if (parsed.data.role && !isSelf) {
    target.role = parsed.data.role;
  }
  if (parsed.data.active !== undefined && !isSelf) {
    target.active = parsed.data.active;
  }
  if (parsed.data.newPassword) {
    target.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    if (!target.authProviders.includes('local')) target.authProviders.push('local');
  }

  await target.save();
  await logAdminActivity(
    req.user!,
    'update_admin',
    'User',
    target._id.toString(),
    `Updated ${target.email}`
  );

  res.json({
    admin: {
      _id: target._id.toString(),
      name: target.name,
      email: target.email,
      secondaryEmails: target.secondaryEmails || [],
      role: target.role,
      active: target.active,
      authProviders: target.authProviders || [],
      googleLinked: Boolean(target.googleId),
      hasPassword: Boolean(target.passwordHash),
      createdAt: target.createdAt,
    },
  });
});

// Revoke administrative access for a specific user (demotes back to learner or suspends)
router.post('/admins/:id/revoke', requireSuperAdmin, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid administrator identifier.' });
  }
  const mode = req.body?.mode === 'suspend' ? 'suspend' : 'demote';
  const target = await User.findOne({
    _id: req.params.id,
    role: { $in: ['admin', 'super_admin'] },
  });
  if (!target) {
    return res.status(404).json({ error: 'Administrator account not found.' });
  }

  if (String(target._id) === req.user!.id) {
    return res.status(400).json({ error: 'You cannot revoke your own administrative access.' });
  }

  if (target.role === 'super_admin' && target.active) {
    const remainingSuperAdmins = await User.countDocuments({
      _id: { $ne: target._id },
      role: 'super_admin',
      active: true,
    });
    if (remainingSuperAdmins === 0) {
      return res.status(400).json({
        error: 'Cannot revoke the last active Super Administrator in MongoDB.',
      });
    }
  }

  const previousRole = target.role;
  target.role = 'learner';
  if (mode === 'suspend') {
    target.active = false;
  }
  await target.save();

  await logAdminActivity(
    req.user!,
    'revoke_admin_access',
    'User',
    target._id.toString(),
    `Revoked ${previousRole} access from ${target.email} (${mode === 'suspend' ? 'demoted & suspended' : 'demoted to learner'})`
  );

  res.json({
    ok: true,
    revokedEmail: target.email,
    mode,
  });
});

// 13. Work Done / Case Studies Showcase Management
router.get('/work', async (_req, res) => {
  const workItems = await WorkShowcase.find().sort({ order: 1, createdAt: -1 }).lean();
  res.json({ workItems });
});

router.post('/work', async (req, res) => {
  const raw = req.body || {};
  const parsed = workShowcaseWriteSchema.safeParse({
    ...raw,
    order: Number(raw.order ?? 0),
  });
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid work showcase details.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const d = parsed.data;
  const item = await WorkShowcase.create({
    title: stripHtmlTags(d.title),
    clientName: stripHtmlTags(d.clientName),
    industry: stripHtmlTags(d.industry),
    category: stripHtmlTags(d.category),
    summary: stripHtmlTags(d.summary),
    outcomes: d.outcomes.map(stripHtmlTags).filter(Boolean),
    technologies: d.technologies.map(stripHtmlTags).filter(Boolean),
    imageUrl: d.imageUrl,
    projectUrl: d.projectUrl,
    featured: d.featured,
    published: d.published,
    order: d.order,
  });
  await logAdminActivity(req.user!, 'create_work_item', 'WorkShowcase', item._id.toString(), item.title);
  res.status(201).json({ workItem: item });
});

router.patch('/work/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid showcase item identifier.' });
  }
  const raw = req.body || {};
  const candidate: Record<string, unknown> = { ...raw };
  if (raw.order !== undefined) candidate.order = Number(raw.order);
  const parsed = workShowcasePatchSchema.safeParse(candidate);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid showcase update.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const d = parsed.data;
  const update: Record<string, unknown> = {};
  if (d.title !== undefined) update.title = stripHtmlTags(d.title);
  if (d.clientName !== undefined) update.clientName = stripHtmlTags(d.clientName);
  if (d.industry !== undefined) update.industry = stripHtmlTags(d.industry);
  if (d.category !== undefined) update.category = stripHtmlTags(d.category);
  if (d.summary !== undefined) update.summary = stripHtmlTags(d.summary);
  if (d.outcomes !== undefined) update.outcomes = d.outcomes.map(stripHtmlTags).filter(Boolean);
  if (d.technologies !== undefined)
    update.technologies = d.technologies.map(stripHtmlTags).filter(Boolean);
  if (d.imageUrl !== undefined) update.imageUrl = d.imageUrl;
  if (d.projectUrl !== undefined) update.projectUrl = d.projectUrl;
  if (d.featured !== undefined) update.featured = d.featured;
  if (d.published !== undefined) update.published = d.published;
  if (d.order !== undefined) update.order = d.order;

  const updated = await WorkShowcase.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
  if (!updated) return res.status(404).json({ error: 'Work item not found.' });
  await logAdminActivity(req.user!, 'update_work_item', 'WorkShowcase', updated._id.toString(), updated.title);
  res.json({ workItem: updated });
});

router.delete('/work/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid showcase item identifier.' });
  }
  const deleted = await WorkShowcase.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Work item not found.' });
  await logAdminActivity(req.user!, 'delete_work_item', 'WorkShowcase', req.params.id, deleted.title);
  res.json({ ok: true });
});

// 14. Client Testimonials Management
router.get('/testimonials', async (_req, res) => {
  const testimonials = await Testimonial.find().sort({ order: 1, createdAt: -1 }).lean();
  res.json({ testimonials });
});

router.post('/testimonials', async (req, res) => {
  const raw = req.body || {};
  const parsed = testimonialWriteSchema.safeParse({
    ...raw,
    rating: Number(raw.rating ?? 5),
    order: Number(raw.order ?? 0),
  });
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid testimonial details.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const d = parsed.data;
  const item = await Testimonial.create({
    authorName: stripHtmlTags(d.authorName),
    authorRole: stripHtmlTags(d.authorRole),
    company: stripHtmlTags(d.company),
    quote: stripHtmlTags(d.quote),
    rating: d.rating,
    workTitle: stripHtmlTags(d.workTitle),
    featured: d.featured,
    published: d.published,
    order: d.order,
  });
  await logAdminActivity(
    req.user!,
    'create_testimonial',
    'Testimonial',
    item._id.toString(),
    item.authorName
  );
  res.status(201).json({ testimonial: item });
});

router.patch('/testimonials/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid testimonial identifier.' });
  }
  const raw = req.body || {};
  const candidate: Record<string, unknown> = { ...raw };
  if (raw.rating !== undefined) candidate.rating = Number(raw.rating);
  if (raw.order !== undefined) candidate.order = Number(raw.order);
  const parsed = testimonialPatchSchema.safeParse(candidate);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid testimonial update.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const d = parsed.data;
  const update: Record<string, unknown> = {};
  if (d.authorName !== undefined) update.authorName = stripHtmlTags(d.authorName);
  if (d.authorRole !== undefined) update.authorRole = stripHtmlTags(d.authorRole);
  if (d.company !== undefined) update.company = stripHtmlTags(d.company);
  if (d.quote !== undefined) update.quote = stripHtmlTags(d.quote);
  if (d.rating !== undefined) update.rating = d.rating;
  if (d.workTitle !== undefined) update.workTitle = stripHtmlTags(d.workTitle);
  if (d.featured !== undefined) update.featured = d.featured;
  if (d.published !== undefined) update.published = d.published;
  if (d.order !== undefined) update.order = d.order;

  const updated = await Testimonial.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
  if (!updated) return res.status(404).json({ error: 'Testimonial not found.' });
  await logAdminActivity(
    req.user!,
    'update_testimonial',
    'Testimonial',
    updated._id.toString(),
    updated.authorName
  );
  res.json({ testimonial: updated });
});

router.delete('/testimonials/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid testimonial identifier.' });
  }
  const deleted = await Testimonial.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Testimonial not found.' });
  await logAdminActivity(
    req.user!,
    'delete_testimonial',
    'Testimonial',
    req.params.id,
    deleted.authorName
  );
  res.json({ ok: true });
});

// 15. Course Reviews & Star Ratings Management
router.get('/reviews', async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.courseId && req.query.courseId !== 'all') {
    if (!isValidObjectId(req.query.courseId)) {
      return res.status(400).json({ error: 'Invalid course filter.' });
    }
    filter.courseId = req.query.courseId;
  }
  if (req.query.status && req.query.status !== 'all') {
    if (req.query.status === 'published' || req.query.status === 'hidden') {
      filter.status = req.query.status;
    }
  }

  const [reviews, courses] = await Promise.all([
    CourseReview.find(filter)
      .populate('courseId', 'title slug')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .lean(),
    Course.find().select('_id title slug').sort({ order: 1, createdAt: -1 }).lean(),
  ]);

  res.json({ reviews, courses });
});

router.patch('/reviews/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid review identifier.' });
  }
  const raw = req.body || {};
  const candidate: Record<string, unknown> = { ...raw };
  if (raw.rating !== undefined) candidate.rating = Number(raw.rating);
  const parsed = courseReviewUpdateSchema.safeParse(candidate);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid review update.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.rating !== undefined) update.rating = parsed.data.rating;
  if (parsed.data.title !== undefined) update.title = stripHtmlTags(parsed.data.title);
  if (parsed.data.comment !== undefined) update.comment = stripHtmlTags(parsed.data.comment);

  const updated = await CourseReview.findByIdAndUpdate(req.params.id, { $set: update }, { new: true })
    .populate('courseId', 'title slug')
    .populate('userId', 'name email');
  if (!updated) return res.status(404).json({ error: 'Course review not found.' });

  await logAdminActivity(
    req.user!,
    'moderate_course_review',
    'CourseReview',
    updated._id.toString(),
    `${updated.authorName} (${updated.status}, ${updated.rating}★)`
  );
  res.json({ review: updated });
});

router.delete('/reviews/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid review identifier.' });
  }
  const deleted = await CourseReview.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Course review not found.' });
  await logAdminActivity(
    req.user!,
    'delete_course_review',
    'CourseReview',
    req.params.id,
    deleted.authorName
  );
  res.json({ ok: true });
});

// 16. Course Discount Coupons CRUD
router.get('/coupons', async (_req, res) => {
  try {
    const [coupons, courses] = await Promise.all([
      Coupon.find().populate('courseId', 'title slug').sort({ createdAt: -1 }).lean(),
      Course.find().select('_id title slug price currency published').sort({ order: 1, createdAt: -1 }).lean(),
    ]);
    res.json({ coupons, courses });
  } catch (err) {
    console.error('[Admin Coupons GET] Error:', err);
    res.status(500).json({ error: 'Unable to load coupons.' });
  }
});

router.post('/coupons', async (req, res) => {
  try {
    const raw = req.body || {};
    const parsed = couponWriteSchema.safeParse({
      ...raw,
      discountPercent: Number(raw.discountPercent),
      maxUses: raw.maxUses !== undefined && raw.maxUses !== '' ? Number(raw.maxUses) : 0,
      courseId: raw.courseId && String(raw.courseId).trim() ? String(raw.courseId).trim() : null,
      expiresAt: raw.expiresAt && String(raw.expiresAt).trim() ? String(raw.expiresAt).trim() : null,
      active: raw.active !== false,
    });
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid coupon data.',
        fieldErrors: zodToFieldErrors(parsed.error),
      });
    }

    const code = parsed.data.code.toUpperCase();
    const existing = await Coupon.findOne({ code }).lean();
    if (existing) {
      return res.status(409).json({ error: `A coupon with code "${code}" already exists.` });
    }

    if (parsed.data.courseId) {
      const courseExists = await Course.exists({ _id: parsed.data.courseId });
      if (!courseExists) return res.status(404).json({ error: 'Selected course does not exist.' });
    }

    const expiresAtDate = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;

    const created = await Coupon.create({
      code,
      description: stripHtmlTags(parsed.data.description),
      discountPercent: Math.round(parsed.data.discountPercent),
      courseId: parsed.data.courseId || null,
      maxUses: parsed.data.maxUses,
      expiresAt: expiresAtDate,
      active: parsed.data.active,
    });

    const populated = await Coupon.findById(created._id).populate('courseId', 'title slug').lean();
    await logAdminActivity(
      req.user!,
      'create_coupon',
      'Coupon',
      created._id.toString(),
      `${code} (${Math.round(parsed.data.discountPercent)}% off)`
    );

    res.status(201).json({ coupon: populated });
  } catch (err) {
    console.error('[Admin Coupons POST] Error:', err);
    res.status(500).json({ error: 'Unable to create coupon.' });
  }
});

router.patch('/coupons/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid coupon identifier.' });
    }
    const raw = req.body || {};
    const candidate: Record<string, unknown> = { ...raw };
    if (raw.discountPercent !== undefined) candidate.discountPercent = Number(raw.discountPercent);
    if (raw.maxUses !== undefined) candidate.maxUses = raw.maxUses === '' ? 0 : Number(raw.maxUses);
    if (raw.courseId !== undefined) {
      candidate.courseId = raw.courseId && String(raw.courseId).trim() ? String(raw.courseId).trim() : null;
    }
    if (raw.expiresAt !== undefined) {
      candidate.expiresAt = raw.expiresAt && String(raw.expiresAt).trim() ? String(raw.expiresAt).trim() : null;
    }

    const parsed = couponPatchSchema.safeParse(candidate);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid coupon update.',
        fieldErrors: zodToFieldErrors(parsed.error),
      });
    }

    const d = parsed.data;
    const update: Record<string, unknown> = {};

    if (d.code !== undefined) {
      const cleanCode = d.code.trim().toUpperCase();
      const clash = await Coupon.findOne({ code: cleanCode, _id: { $ne: req.params.id } }).lean();
      if (clash) {
        return res.status(409).json({ error: `Coupon code "${cleanCode}" is already used.` });
      }
      update.code = cleanCode;
    }
    if (d.description !== undefined) update.description = stripHtmlTags(d.description);
    if (d.discountPercent !== undefined) update.discountPercent = Math.round(d.discountPercent);
    if (d.courseId !== undefined) {
      if (d.courseId) {
        const exists = await Course.exists({ _id: d.courseId });
        if (!exists) return res.status(404).json({ error: 'Selected course does not exist.' });
      }
      update.courseId = d.courseId;
    }
    if (d.maxUses !== undefined) update.maxUses = d.maxUses;
    if (d.expiresAt !== undefined) update.expiresAt = d.expiresAt ? new Date(d.expiresAt) : null;
    if (d.active !== undefined) update.active = d.active;

    const updated = await Coupon.findByIdAndUpdate(req.params.id, { $set: update }, { new: true })
      .populate('courseId', 'title slug')
      .lean();
    if (!updated) return res.status(404).json({ error: 'Coupon not found.' });

    const u = updated as { _id: unknown; code: string; discountPercent: number; active: boolean };
    await logAdminActivity(
      req.user!,
      'update_coupon',
      'Coupon',
      String(u._id),
      `${u.code} (${u.discountPercent}% off, active=${u.active})`
    );
    res.json({ coupon: updated });
  } catch (err) {
    console.error('[Admin Coupons PATCH] Error:', err);
    res.status(500).json({ error: 'Unable to update coupon.' });
  }
});

router.delete('/coupons/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid coupon identifier.' });
    }
    const deleted = await Coupon.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Coupon not found.' });
    await logAdminActivity(req.user!, 'delete_coupon', 'Coupon', req.params.id, deleted.code);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin Coupons DELETE] Error:', err);
    res.status(500).json({ error: 'Unable to delete coupon.' });
  }
});

export default router;
