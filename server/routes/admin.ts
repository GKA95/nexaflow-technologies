import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { connectDB, getLastDBError, isDBConfigured } from '../db.js';
import { DEFAULT_SEO_PAGES, DEFAULT_SITE_SETTINGS } from '../defaults.js';
import {
  authLimiter,
  extractYouTubeId,
  isGoogleOAuthConfigured,
  isJwtSecretConfigured,
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
import { isEmailConfigured } from '../utils/email.js';
import { getPaystackMode, isPaystackConfigured } from '../utils/paystack.js';

const router = Router();

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
      dbError: lastErr.message || null,
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
      dbError: lastErr.message || null,
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

    const schema = z.object({
      setupToken: z.string().optional().default(''),
      name: z.string().trim().min(2, 'Full name is required.').max(120),
      email: z.string().trim().email('Valid email is required.').max(180),
      secondaryEmails: z.array(z.string().trim().email()).max(10).optional().default([]),
      password: z.string().min(10, 'Administrator password must be at least 10 characters.').max(128),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid setup data.' });
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
    return res.status(500).json({
      error:
        err instanceof Error && err.message
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
  const body = req.body || {};
  const title = stripHtmlTags(String(body.title || ''));
  if (title.length < 3) return res.status(400).json({ error: 'Course title is required.' });
  const slug = slugify(body.slug || title);

  const course = await Course.create({
    title,
    slug,
    shortDescription: stripHtmlTags(String(body.shortDescription || '')),
    fullDescription: String(body.fullDescription || ''),
    coverImage: String(body.coverImage || ''),
    price: Number(body.price || 0),
    currency: String(body.currency || 'GHS').toUpperCase(),
    objectives: Array.isArray(body.objectives) ? body.objectives : [],
    outcomes: Array.isArray(body.outcomes) ? body.outcomes : [],
    published: Boolean(body.published),
    order: Number(body.order || 0),
    seoTitle: String(body.seoTitle || ''),
    seoDescription: String(body.seoDescription || ''),
    canonicalUrl: String(body.canonicalUrl || ''),
    ogImage: String(body.ogImage || ''),
    noIndex: Boolean(body.noIndex),
    focusKeyword: String(body.focusKeyword || ''),
  });

  await logAdminActivity(req.user!, 'create_course', 'Course', course._id.toString(), course.title);
  res.status(201).json({ course });
});

router.patch('/courses/:id', async (req, res) => {
  const body = req.body || {};
  const update: Record<string, unknown> = { ...body };
  if (body.slug) update.slug = slugify(String(body.slug));
  if (body.currency) update.currency = String(body.currency).toUpperCase();
  if (body.price !== undefined) update.price = Number(body.price);

  const updated = await Course.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!updated) return res.status(404).json({ error: 'Course not found.' });

  await logAdminActivity(req.user!, 'update_course', 'Course', updated._id.toString(), updated.title);
  res.json({ course: updated });
});

router.delete('/courses/:id', async (req, res) => {
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
  const { title, description, order } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Module title is required.' });
  const count = await Module.countDocuments({ courseId: req.params.courseId });
  const mod = await Module.create({
    courseId: req.params.courseId,
    title: stripHtmlTags(String(title)),
    description: String(description || ''),
    order: Number(order ?? count + 1),
  });
  await logAdminActivity(req.user!, 'create_module', 'Module', mod._id.toString(), mod.title);
  res.status(201).json({ module: mod });
});

router.patch('/modules/:id', async (req, res) => {
  const updated = await Module.findByIdAndUpdate(req.params.id, req.body || {}, { new: true });
  if (!updated) return res.status(404).json({ error: 'Module not found.' });
  res.json({ module: updated });
});

router.delete('/modules/:id', async (req, res) => {
  await Promise.all([
    Lesson.deleteMany({ moduleId: req.params.id }),
    Module.deleteOne({ _id: req.params.id }),
  ]);
  res.json({ ok: true });
});

router.post('/courses/:courseId/lessons/bulk', async (req, res) => {
  const course = await Course.findById(req.params.courseId).lean();
  if (!course) return res.status(404).json({ error: 'Course not found.' });

  const { moduleId, lessons } = (req.body || {}) as {
    moduleId?: string;
    lessons?: Array<{
      title?: string;
      youtubeUrl?: string;
      duration?: string;
      notes?: string;
      published?: boolean;
    }>;
  };

  if (!Array.isArray(lessons) || lessons.length === 0) {
    return res.status(400).json({ error: 'Please add at least one video lesson.' });
  }

  let targetModuleId = moduleId ? String(moduleId).trim() : '';
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

  for (let i = 0; i < lessons.length; i++) {
    const item = lessons[i];
    if (!item?.title || !String(item.title).trim()) {
      return res.status(400).json({ error: `Video #${i + 1} is missing a title.` });
    }
    if (!item?.youtubeUrl || !extractYouTubeId(String(item.youtubeUrl))) {
      return res.status(400).json({
        error: `Video #${i + 1} needs a valid YouTube URL (youtube.com/watch?v=... or youtu.be/...).`,
      });
    }
  }

  const existingCount = await Lesson.countDocuments({ moduleId: targetModuleId });
  const createdLessons = await Promise.all(
    lessons.map((item, idx) =>
      Lesson.create({
        courseId: req.params.courseId,
        moduleId: targetModuleId,
        title: stripHtmlTags(String(item.title || '')),
        notes: String(item.notes || ''),
        youtubeUrl: String(item.youtubeUrl || '').trim(),
        duration: String(item.duration || '').trim(),
        order: existingCount + idx + 1,
        published: item.published !== false,
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
  const mod = await Module.findById(req.params.moduleId).lean();
  if (!mod) return res.status(404).json({ error: 'Module not found.' });

  const { title, notes, youtubeUrl, duration, order, published } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Lesson title is required.' });
  if (youtubeUrl && !extractYouTubeId(String(youtubeUrl))) {
    return res.status(400).json({
      error: 'Please enter a valid YouTube video URL (youtube.com/watch?v=... or youtu.be/...).',
    });
  }

  const count = await Lesson.countDocuments({ moduleId: req.params.moduleId });
  const lesson = await Lesson.create({
    courseId: (mod as { courseId: unknown }).courseId,
    moduleId: req.params.moduleId,
    title: stripHtmlTags(String(title)),
    notes: String(notes || ''),
    youtubeUrl: String(youtubeUrl || '').trim(),
    duration: String(duration || '').trim(),
    order: Number(order ?? count + 1),
    published: published !== false,
  });

  await logAdminActivity(req.user!, 'create_lesson', 'Lesson', lesson._id.toString(), lesson.title);
  res.status(201).json({ lesson });
});

router.patch('/lessons/:id', async (req, res) => {
  const body = { ...(req.body || {}) };
  if (body.youtubeUrl && !extractYouTubeId(String(body.youtubeUrl))) {
    return res.status(400).json({
      error: 'Please enter a valid YouTube video URL (youtube.com/watch?v=... or youtu.be/...).',
    });
  }
  if (typeof body.title === 'string') body.title = stripHtmlTags(body.title);
  if (typeof body.youtubeUrl === 'string') body.youtubeUrl = body.youtubeUrl.trim();
  if (typeof body.duration === 'string') body.duration = body.duration.trim();
  const updated = await Lesson.findByIdAndUpdate(req.params.id, body, { new: true });
  if (!updated) return res.status(404).json({ error: 'Lesson not found.' });
  await logAdminActivity(req.user!, 'update_lesson', 'Lesson', updated._id.toString(), updated.title);
  res.json({ lesson: updated });
});

router.delete('/lessons/:id', async (req, res) => {
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
  const active = Boolean(req.body?.active);
  const updated = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'learner' },
    { active },
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
  const courseId = String(req.body?.courseId || '').trim();
  if (!courseId) return res.status(400).json({ error: 'Course ID is required.' });

  const [learner, course] = await Promise.all([
    User.findOne({ _id: req.params.id, role: 'learner' }).select('_id name email').lean(),
    Course.findById(courseId).select('_id title slug').lean(),
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
  const [learner, course] = await Promise.all([
    User.findOne({ _id: id, role: 'learner' }).select('_id name email').lean(),
    Course.findById(courseId).select('_id title').lean(),
  ]);

  if (!learner) return res.status(404).json({ error: 'Learner not found.' });

  const enrolment = await Enrolment.findOneAndUpdate(
    { userId: id, courseId, status: 'active' },
    { status: 'revoked' },
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

// 4. Payments Management
router.get('/payments', async (req, res) => {
  const status = String(req.query.status || '').trim();
  const filter: Record<string, unknown> = {};
  if (status && status !== 'All') filter.status = status;

  const payments = await Payment.find(filter)
    .populate('userId', 'name email')
    .populate('courseId', 'title slug')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ payments });
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
    if (dateFrom) createdAt.$gte = new Date(dateFrom);
    if (dateTo) createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    filter.createdAt = createdAt;
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
  const ids = typeof req.query.ids === 'string' && req.query.ids ? req.query.ids.split(',') : null;
  const filter = ids ? { _id: { $in: ids } } : {};
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
  const lead = await Lead.findById(req.params.id).lean();
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });
  const activities = await LeadActivity.find({ leadId: req.params.id }).sort({ createdAt: -1 }).lean();
  res.json({ lead, activities });
});

router.patch('/leads/:id', async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });

  const { status, followUpDate, outcomeReason } = req.body || {};
  const previousStatus = lead.status;

  if (status) lead.status = status;
  if (followUpDate !== undefined) {
    lead.followUpDate = followUpDate ? new Date(followUpDate) : undefined;
  }
  if (outcomeReason !== undefined) {
    lead.outcomeReason = stripHtmlTags(String(outcomeReason));
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
  const { type, content } = req.body || {};
  if (!content || String(content).trim().length < 2) {
    return res.status(400).json({ error: 'Activity note is required.' });
  }
  const activity = await LeadActivity.create({
    leadId: req.params.id,
    adminId: req.user!.id,
    adminName: req.user!.name,
    type: type || 'note',
    content: stripHtmlTags(String(content)),
  });
  res.status(201).json({ activity });
});

// 6. Products Management
router.get('/products', async (_req, res) => {
  const products = await Product.find().sort({ order: 1, createdAt: -1 }).lean();
  res.json({ products });
});

router.post('/products', async (req, res) => {
  const body = req.body || {};
  const name = stripHtmlTags(String(body.name || ''));
  if (!name) return res.status(400).json({ error: 'Product name required.' });
  const product = await Product.create({
    ...body,
    name,
    slug: slugify(body.slug || name),
  });
  await logAdminActivity(req.user!, 'create_product', 'Product', product._id.toString(), product.name);
  res.status(201).json({ product });
});

router.patch('/products/:id', async (req, res) => {
  const body = req.body || {};
  if (body.slug) body.slug = slugify(String(body.slug));
  const updated = await Product.findByIdAndUpdate(req.params.id, body, { new: true });
  if (!updated) return res.status(404).json({ error: 'Product not found.' });
  await logAdminActivity(req.user!, 'update_product', 'Product', updated._id.toString(), updated.name);
  res.json({ product: updated });
});

router.delete('/products/:id', async (req, res) => {
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
  const body = req.body || {};
  const name = stripHtmlTags(String(body.name || ''));
  if (!name) return res.status(400).json({ error: 'Service name required.' });
  const service = await Service.create({
    ...body,
    name,
    slug: slugify(body.slug || name),
  });
  await logAdminActivity(req.user!, 'create_service', 'Service', service._id.toString(), service.name);
  res.status(201).json({ service });
});

router.patch('/services/:id', async (req, res) => {
  const body = req.body || {};
  if (body.slug) body.slug = slugify(String(body.slug));
  const updated = await Service.findByIdAndUpdate(req.params.id, body, { new: true });
  if (!updated) return res.status(404).json({ error: 'Service not found.' });
  await logAdminActivity(req.user!, 'update_service', 'Service', updated._id.toString(), updated.name);
  res.json({ service: updated });
});

router.delete('/services/:id', async (req, res) => {
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
  const body = req.body || {};
  const title = stripHtmlTags(String(body.title || ''));
  if (!title) return res.status(400).json({ error: 'Article title required.' });
  const content = String(body.content || '');
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(words / 200));

  const article = await Article.create({
    ...body,
    title,
    slug: slugify(body.slug || title),
    readingTimeMinutes,
    publishedAt:
      body.status === 'published'
        ? body.publishedAt
          ? new Date(body.publishedAt)
          : new Date()
        : body.publishedAt
          ? new Date(body.publishedAt)
          : undefined,
  });

  await logAdminActivity(req.user!, 'create_article', 'Article', article._id.toString(), article.title);
  res.status(201).json({ article });
});

router.patch('/articles/:id', async (req, res) => {
  const body = req.body || {};
  if (body.slug) body.slug = slugify(String(body.slug));
  if (typeof body.content === 'string') {
    const words = body.content.trim().split(/\s+/).filter(Boolean).length;
    body.readingTimeMinutes = Math.max(1, Math.ceil(words / 200));
  }
  if (body.status === 'published' && !body.publishedAt) {
    body.publishedAt = new Date();
  }
  const updated = await Article.findByIdAndUpdate(req.params.id, body, { new: true });
  if (!updated) return res.status(404).json({ error: 'Article not found.' });
  await logAdminActivity(req.user!, 'update_article', 'Article', updated._id.toString(), updated.title);
  res.json({ article: updated });
});

router.delete('/articles/:id', async (req, res) => {
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
  const ticket = await SupportTicket.findById(req.params.id)
    .populate('userId', 'name email')
    .populate('courseId', 'title slug')
    .lean();
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  const messages = await SupportMessage.find({ ticketId: req.params.id }).sort({ createdAt: 1 }).lean();
  res.json({ ticket, messages });
});

router.patch('/tickets/:id', async (req, res) => {
  const { status } = req.body || {};
  const updated = await SupportTicket.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );
  if (!updated) return res.status(404).json({ error: 'Ticket not found.' });
  await logAdminActivity(
    req.user!,
    'update_ticket_status',
    'SupportTicket',
    updated._id.toString(),
    `${updated.referenceNumber} -> ${status}`
  );
  res.json({ ticket: updated });
});

router.post('/tickets/:id/messages', async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  const messageText = stripHtmlTags(String(req.body?.message || ''));
  if (messageText.length < 2) return res.status(400).json({ error: 'Reply cannot be empty.' });

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
  const body = { ...(req.body || {}) };
  delete body._id;
  delete body.key;
  const updated = await SiteSettings.findOneAndUpdate(
    { key: 'main' },
    { $set: body },
    { upsert: true, new: true }
  ).lean();
  await logAdminActivity(
    req.user!,
    'update_site_settings',
    'SiteSettings',
    'main',
    body.seoSiteTitle || body.seoOgImage ? 'Updated global SEO & site settings' : 'Updated site/business settings'
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
  const body = req.body || {};
  const payload = {
    pageKey,
    title: typeof body.title === 'string' ? body.title.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    canonicalUrl: typeof body.canonicalUrl === 'string' ? body.canonicalUrl.trim() : '',
    ogTitle: typeof body.ogTitle === 'string' ? body.ogTitle.trim() : '',
    ogDescription: typeof body.ogDescription === 'string' ? body.ogDescription.trim() : '',
    ogImage: typeof body.ogImage === 'string' ? body.ogImage.trim() : '',
    focusKeyword: typeof body.focusKeyword === 'string' ? body.focusKeyword.trim() : '',
    noIndex: Boolean(body.noIndex),
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
  const schema = z.object({
    name: z.string().trim().max(120).optional().default(''),
    email: z.string().trim().email('Valid email address is required.').max(180),
    secondaryEmails: z.array(z.string().trim().email()).max(10).optional().default([]),
    password: z.string().max(128).optional().default(''),
    role: z.enum(['admin', 'super_admin']).default('admin'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message || 'Invalid admin payload.' });
  }
  if (parsed.data.password && parsed.data.password.length < 10) {
    return res
      .status(400)
      .json({ error: 'Administrator password must be at least 10 characters when provided.' });
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

    // Existing learner user -> grant administrative access directly
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
  const schema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(180).optional(),
    secondaryEmails: z.array(z.string().trim().email()).max(10).optional(),
    role: z.enum(['admin', 'super_admin']).optional(),
    active: z.boolean().optional(),
    newPassword: z.string().max(128).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message || 'Invalid update payload.' });
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
    if (parsed.data.newPassword.length < 10) {
      return res
        .status(400)
        .json({ error: 'Administrator password must be at least 10 characters.' });
    }
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
  const b = req.body || {};
  const title = stripHtmlTags(String(b.title || '').trim());
  const summary = stripHtmlTags(String(b.summary || '').trim());
  if (!title || !summary) {
    return res.status(400).json({ error: 'Project title and summary are required.' });
  }
  const item = await WorkShowcase.create({
    title,
    clientName: stripHtmlTags(String(b.clientName || '').trim()),
    industry: stripHtmlTags(String(b.industry || '').trim()),
    category: stripHtmlTags(String(b.category || 'AI Automation').trim()),
    summary,
    outcomes: Array.isArray(b.outcomes)
      ? b.outcomes.map((o: unknown) => stripHtmlTags(String(o).trim())).filter(Boolean)
      : [],
    technologies: Array.isArray(b.technologies)
      ? b.technologies.map((t: unknown) => stripHtmlTags(String(t).trim())).filter(Boolean)
      : [],
    imageUrl: String(b.imageUrl || '').trim(),
    projectUrl: String(b.projectUrl || '').trim(),
    featured: b.featured !== false,
    published: b.published !== false,
    order: Number(b.order || 0),
  });
  await logAdminActivity(req.user!, 'create_work_item', 'WorkShowcase', item._id.toString(), item.title);
  res.status(201).json({ workItem: item });
});

router.patch('/work/:id', async (req, res) => {
  const b = req.body || {};
  const update: Record<string, unknown> = {};
  if (b.title !== undefined) update.title = stripHtmlTags(String(b.title).trim());
  if (b.clientName !== undefined) update.clientName = stripHtmlTags(String(b.clientName).trim());
  if (b.industry !== undefined) update.industry = stripHtmlTags(String(b.industry).trim());
  if (b.category !== undefined) update.category = stripHtmlTags(String(b.category).trim());
  if (b.summary !== undefined) update.summary = stripHtmlTags(String(b.summary).trim());
  if (Array.isArray(b.outcomes)) {
    update.outcomes = b.outcomes.map((o: unknown) => stripHtmlTags(String(o).trim())).filter(Boolean);
  }
  if (Array.isArray(b.technologies)) {
    update.technologies = b.technologies
      .map((t: unknown) => stripHtmlTags(String(t).trim()))
      .filter(Boolean);
  }
  if (b.imageUrl !== undefined) update.imageUrl = String(b.imageUrl).trim();
  if (b.projectUrl !== undefined) update.projectUrl = String(b.projectUrl).trim();
  if (b.featured !== undefined) update.featured = Boolean(b.featured);
  if (b.published !== undefined) update.published = Boolean(b.published);
  if (b.order !== undefined) update.order = Number(b.order || 0);

  const updated = await WorkShowcase.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!updated) return res.status(404).json({ error: 'Work item not found.' });
  await logAdminActivity(req.user!, 'update_work_item', 'WorkShowcase', updated._id.toString(), updated.title);
  res.json({ workItem: updated });
});

router.delete('/work/:id', async (req, res) => {
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
  const b = req.body || {};
  const authorName = stripHtmlTags(String(b.authorName || '').trim());
  const quote = stripHtmlTags(String(b.quote || '').trim());
  if (!authorName || !quote) {
    return res.status(400).json({ error: 'Author name and testimonial quote are required.' });
  }
  const rating = Math.min(5, Math.max(1, Math.round(Number(b.rating || 5))));
  const item = await Testimonial.create({
    authorName,
    authorRole: stripHtmlTags(String(b.authorRole || '').trim()),
    company: stripHtmlTags(String(b.company || '').trim()),
    quote,
    rating,
    workTitle: stripHtmlTags(String(b.workTitle || '').trim()),
    featured: b.featured !== false,
    published: b.published !== false,
    order: Number(b.order || 0),
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
  const b = req.body || {};
  const update: Record<string, unknown> = {};
  if (b.authorName !== undefined) update.authorName = stripHtmlTags(String(b.authorName).trim());
  if (b.authorRole !== undefined) update.authorRole = stripHtmlTags(String(b.authorRole).trim());
  if (b.company !== undefined) update.company = stripHtmlTags(String(b.company).trim());
  if (b.quote !== undefined) update.quote = stripHtmlTags(String(b.quote).trim());
  if (b.rating !== undefined) update.rating = Math.min(5, Math.max(1, Math.round(Number(b.rating))));
  if (b.workTitle !== undefined) update.workTitle = stripHtmlTags(String(b.workTitle).trim());
  if (b.featured !== undefined) update.featured = Boolean(b.featured);
  if (b.published !== undefined) update.published = Boolean(b.published);
  if (b.order !== undefined) update.order = Number(b.order || 0);

  const updated = await Testimonial.findByIdAndUpdate(req.params.id, update, { new: true });
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
    filter.courseId = req.query.courseId;
  }
  if (req.query.status && req.query.status !== 'all') {
    filter.status = req.query.status;
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
  const b = req.body || {};
  const update: Record<string, unknown> = {};
  if (b.status === 'published' || b.status === 'hidden') update.status = b.status;
  if (b.rating !== undefined) update.rating = Math.min(5, Math.max(1, Math.round(Number(b.rating))));
  if (b.title !== undefined) update.title = stripHtmlTags(String(b.title).trim());
  if (b.comment !== undefined) update.comment = stripHtmlTags(String(b.comment).trim());

  const updated = await CourseReview.findByIdAndUpdate(req.params.id, update, { new: true })
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

export default router;
