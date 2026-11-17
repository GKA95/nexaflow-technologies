import crypto from 'crypto';
import { Router } from 'express';
import {
  blockDownloadManagers,
  extractYouTubeId,
  isValidObjectId,
  requireAuth,
  requireDatabase,
  stripHtmlTags,
  supportLimiter,
} from '../middleware/auth.js';
import {
  Coupon,
  Course,
  CourseReview,
  Enrolment,
  Lesson,
  LessonProgress,
  Module,
  Notification,
  Payment,
  SupportMessage,
  SupportTicket,
} from '../models.js';
import {
  courseReviewFormSchema,
  lessonProgressSchema,
  supportReplySchema,
  supportTicketCreateSchema,
  zodToFieldErrors,
} from '../shared/validation.js';
import { calculateCouponDiscount, validateCouponForPricing } from '../utils/coupons.js';

const router = Router();

router.use(blockDownloadManagers);
router.use(requireDatabase);
router.use(requireAuth);

router.get('/dashboard', async (req, res) => {
  const userId = req.user!.id;

  const [enrolments, progressRecords, tickets, notifications, payments] = await Promise.all([
    Enrolment.find({ userId, status: 'active' }).populate('courseId').sort({ activatedAt: -1 }).lean(),
    LessonProgress.find({ userId }).sort({ lastAccessedAt: -1 }).lean(),
    SupportTicket.find({ userId }).sort({ updatedAt: -1 }).lean(),
    Notification.find({ userId, targetRole: 'learner' }).sort({ createdAt: -1 }).limit(30).lean(),
    Payment.find({ userId })
      .select('-processedEvents')
      .populate('courseId', 'title slug')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const coursesSummary = await Promise.all(
    enrolments
      .filter((e: Record<string, unknown>) => Boolean(e.courseId))
      .map(async (enrolment: Record<string, unknown>) => {
        const course = enrolment.courseId as Record<string, unknown>;
        const courseId = course._id;
        const publishedLessons = await Lesson.find({ courseId, published: true })
          .sort({ order: 1 })
          .select('_id title moduleId order')
          .lean();

        const totalLessons = publishedLessons.length;
        const courseProgress = progressRecords.filter(
          (p: Record<string, unknown>) => String(p.courseId) === String(courseId)
        );
        const completedLessonIds = new Set(
          courseProgress
            .filter((p: Record<string, unknown>) => p.completed)
            .map((p: Record<string, unknown>) => String(p.lessonId))
        );
        const completedCount = publishedLessons.filter((l: Record<string, unknown>) =>
          completedLessonIds.has(String(l._id))
        ).length;
        const percent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
        const lastProgress = courseProgress[0] as Record<string, unknown> | undefined;
        const lastLessonId = lastProgress ? String(lastProgress.lessonId) : publishedLessons[0]?._id;

        return {
          enrolmentId: enrolment._id,
          activatedAt: enrolment.activatedAt,
          course,
          totalLessons,
          completedCount,
          remainingCount: Math.max(0, totalLessons - completedCount),
          percent,
          lastLessonId: lastLessonId ? String(lastLessonId) : null,
        };
      })
  );

  const totalCompletedLessons = coursesSummary.reduce((acc, c) => acc + c.completedCount, 0);

  res.json({
    courses: coursesSummary,
    stats: {
      enrolledCourses: coursesSummary.length,
      completedLessons: totalCompletedLessons,
      openTickets: tickets.filter((t: Record<string, unknown>) => t.status !== 'Closed').length,
      unreadNotifications: notifications.filter((n: Record<string, unknown>) => !n.read).length,
    },
    tickets,
    notifications,
    payments,
  });
});

// Enrolment for explicitly free courses OR 100%-off validated coupon codes
router.post('/enrol-free', async (req, res) => {
  try {
    const courseId = String(req.body?.courseId || '').trim();
    const couponCode = req.body?.couponCode ? String(req.body.couponCode).trim() : '';

    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ error: 'Valid Course ID required.' });
    }

    const course = await Course.findOne({ _id: courseId, published: true }).lean();
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const c = course as Record<string, unknown>;
    const coursePrice = Number(c.price || 0);
    let redeemedCouponCode = '';

    if (coursePrice > 0) {
      if (!couponCode) {
        return res.status(400).json({ error: 'Paid courses require verified Paystack payment.' });
      }
      const check = await validateCouponForPricing({
        code: couponCode,
        courseId: String(c._id),
      });
      if (!check.ok) {
        return res.status(check.status).json({ error: check.error });
      }
      const pricing = calculateCouponDiscount(coursePrice, check.coupon.discountPercent);
      if (pricing.finalAmount > 0) {
        return res.status(400).json({
          error: `Coupon "${check.coupon.code}" gives ${check.coupon.discountPercent}% off — please complete checkout for ${String(c.currency || 'GHS')} ${pricing.finalAmount}.`,
        });
      }

      const atomicCoupon = await Coupon.findOneAndUpdate(
        {
          _id: check.coupon.couponId,
          active: true,
          $or: [{ maxUses: { $lte: 0 } }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }],
        },
        { $inc: { usedCount: 1 } },
        { new: true }
      );
      if (!atomicCoupon) {
        return res.status(400).json({ error: 'This coupon has reached its redemption limit.' });
      }
      redeemedCouponCode = atomicCoupon.code;
    }

    let paymentId: unknown = undefined;
    if (redeemedCouponCode) {
      const ref = `NF-CPN-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const zeroPay = await Payment.create({
        userId: req.user!.id,
        courseId: c._id,
        reference: ref,
        amount: 0,
        originalAmount: coursePrice,
        discountAmount: coursePrice,
        discountPercent: 100,
        couponCode: redeemedCouponCode,
        currency: String(c.currency || 'GHS').toUpperCase(),
        status: 'success',
        provider: 'coupon',
        gatewayResponse: `100% discount coupon (${redeemedCouponCode})`,
        verifiedAt: new Date(),
      });
      paymentId = zeroPay._id;
    }

    const enrolment = await Enrolment.findOneAndUpdate(
      { userId: req.user!.id, courseId: c._id },
      {
        userId: req.user!.id,
        courseId: c._id,
        ...(paymentId ? { paymentId } : {}),
        status: 'active',
        activatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    await Notification.create({
      userId: req.user!.id,
      targetRole: 'learner',
      title: `Enrolled: ${String(c.title)}`,
      message: redeemedCouponCode
        ? `Your 100% discount coupon (${redeemedCouponCode}) unlocked course access.`
        : 'Your free course access is now active.',
      link: `/learner/courses/${String(c.slug)}`,
    });

    if (redeemedCouponCode) {
      await Notification.create({
        targetRole: 'admin',
        title: `100% Coupon Enrolment: ${redeemedCouponCode}`,
        message: `${req.user!.name} enrolled in "${String(c.title)}" using 100% coupon ${redeemedCouponCode}.`,
        link: '/portal-admin?tab=coupons',
      });
    }

    return res.json({ ok: true, enrolment });
  } catch (err) {
    console.error('[Learner Enrol-Free] Error:', err);
    return res.status(500).json({ error: 'Unable to activate course enrolment.' });
  }
});

// Protected course classroom player — checks active enrolment strictly server-side
router.get('/courses/:slug/learn', async (req, res) => {
  const slug = String(req.params.slug || '').trim().toLowerCase();
  const course = await Course.findOne({ slug }).lean();
  if (!course) return res.status(404).json({ error: 'Course not found.' });

  const courseObj = course as Record<string, unknown>;
  const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';

  if (!isAdmin) {
    const enrolment = await Enrolment.findOne({
      userId: req.user!.id,
      courseId: courseObj._id,
      status: 'active',
    }).lean();
    if (!enrolment) {
      return res.status(403).json({
        error: 'Active enrolment is required to access course lessons and videos.',
        code: 'ENROLMENT_REQUIRED',
      });
    }
  }

  const [modules, lessons, progress, myReview] = await Promise.all([
    Module.find({ courseId: courseObj._id }).sort({ order: 1 }).lean(),
    Lesson.find({ courseId: courseObj._id, published: true }).sort({ order: 1 }).lean(),
    LessonProgress.find({ userId: req.user!.id, courseId: courseObj._id }).lean(),
    CourseReview.findOne({ courseId: courseObj._id, userId: req.user!.id }).lean(),
  ]);

  const progressMap = new Map(
    progress.map((p: Record<string, unknown>) => [String(p.lessonId), p])
  );

  const enrichedLessons = lessons.map((l: Record<string, unknown>) => {
    const p = progressMap.get(String(l._id)) as Record<string, unknown> | undefined;
    const hasVideo = Boolean(extractYouTubeId(String(l.youtubeUrl || '')));
    // Strip raw youtubeUrl and video ID from bulk syllabus response
    const { youtubeUrl: _omittedUrl, ...safeLesson } = l;
    return {
      ...safeLesson,
      hasVideo,
      completed: Boolean(p?.completed),
      lastAccessedAt: p?.lastAccessedAt || null,
    };
  });

  const structuredModules = modules.map((m: Record<string, unknown>) => ({
    ...m,
    lessons: enrichedLessons.filter((l: Record<string, unknown>) => String(l.moduleId) === String(m._id)),
  }));

  const completedCount = enrichedLessons.filter((l) => l.completed).length;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json({
    course: courseObj,
    modules: structuredModules,
    stats: {
      totalLessons: enrichedLessons.length,
      completedCount,
      percent:
        enrichedLessons.length > 0 ? Math.round((completedCount / enrichedLessons.length) * 100) : 0,
    },
    myReview: myReview || null,
  });
});

// Submit or update course rating & review (enrolled learners)
router.post('/courses/:slug/review', async (req, res) => {
  const parsed = courseReviewFormSchema.safeParse({
    rating: Number(req.body?.rating),
    title: req.body?.title,
    comment: req.body?.comment,
  });
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid review data.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const slug = String(req.params.slug || '').trim().toLowerCase();
  const course = await Course.findOne({ slug }).lean();
  if (!course) return res.status(404).json({ error: 'Course not found.' });

  const courseObj = course as { _id: unknown; title: string; slug: string };
  const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';

  if (!isAdmin) {
    const enrolment = await Enrolment.findOne({
      userId: req.user!.id,
      courseId: courseObj._id,
      status: 'active',
    }).lean();
    if (!enrolment) {
      return res.status(403).json({ error: 'Only enrolled learners can review this course.' });
    }
  }

  const [totalLessons, completedLessons] = await Promise.all([
    Lesson.countDocuments({ courseId: courseObj._id, published: true }),
    LessonProgress.countDocuments({ userId: req.user!.id, courseId: courseObj._id, completed: true }),
  ]);
  const completedCourse = totalLessons > 0 && completedLessons >= totalLessons;

  const review = await CourseReview.findOneAndUpdate(
    { courseId: courseObj._id, userId: req.user!.id },
    {
      courseId: courseObj._id,
      userId: req.user!.id,
      authorName: req.user!.name,
      rating: parsed.data.rating,
      title: stripHtmlTags(parsed.data.title),
      comment: stripHtmlTags(parsed.data.comment),
      completedCourse,
      status: 'published',
    },
    { upsert: true, new: true }
  );

  await Notification.create({
    targetRole: 'admin',
    title: `Course Review (${parsed.data.rating}★): ${courseObj.title}`,
    message: `${req.user!.name} rated "${courseObj.title}" ${parsed.data.rating}/5 stars.`,
    link: '/portal-admin?tab=reviews',
  });

  res.json({ ok: true, review });
});

// Protected per-lesson playback session — validates active enrolment before authorizing player
router.post('/courses/:slug/lessons/:lessonId/stream-session', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (!isValidObjectId(req.params.lessonId)) {
    return res.status(400).json({ error: 'Invalid lesson identifier.' });
  }

  const slug = String(req.params.slug || '').trim().toLowerCase();
  const course = await Course.findOne({ slug }).lean();
  if (!course) return res.status(404).json({ error: 'Course not found.' });

  const courseObj = course as Record<string, unknown>;
  const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';

  if (!isAdmin) {
    const enrolment = await Enrolment.findOne({
      userId: req.user!.id,
      courseId: courseObj._id,
      status: 'active',
    }).lean();
    if (!enrolment) {
      return res.status(403).json({
        error: 'Active enrolment is required to stream course videos.',
        code: 'ENROLMENT_REQUIRED',
      });
    }
  }

  const lesson = await Lesson.findOne({
    _id: req.params.lessonId,
    courseId: courseObj._id,
    published: true,
  }).lean();
  if (!lesson) {
    return res.status(404).json({ error: 'Video lesson not found.' });
  }

  const videoId = extractYouTubeId(String((lesson as { youtubeUrl?: string }).youtubeUrl || ''));
  if (!videoId) {
    return res.json({ hasVideo: false, payload: null });
  }

  const rawPayload = JSON.stringify({
    v: videoId,
    uid: req.user!.id,
    exp: Date.now() + 2 * 60 * 1000,
  });
  const encoded = Buffer.from(rawPayload, 'utf8').toString('base64');

  return res.json({
    hasVideo: true,
    payload: encoded,
    watermark: `${req.user!.name} · ${req.user!.email}`,
  });
});

router.post('/progress', async (req, res) => {
  const parsed = lessonProgressSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid progress payload.' });
  }

  const { courseId, lessonId, completed } = parsed.data;
  const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';

  if (!isAdmin) {
    const enrolment = await Enrolment.findOne({
      userId: req.user!.id,
      courseId,
      status: 'active',
    }).lean();
    if (!enrolment) {
      return res.status(403).json({ error: 'Active enrolment required.' });
    }
  }

  const lessonExists = await Lesson.exists({ _id: lessonId, courseId });
  if (!lessonExists) {
    return res.status(404).json({ error: 'Lesson not found in this course.' });
  }

  const update: Record<string, unknown> = {
    userId: req.user!.id,
    courseId,
    lessonId,
    lastAccessedAt: new Date(),
  };

  if (typeof completed === 'boolean') {
    update.completed = completed;
    update.completedAt = completed ? new Date() : null;
  }

  const record = await LessonProgress.findOneAndUpdate(
    { userId: req.user!.id, lessonId },
    update,
    { upsert: true, new: true }
  );

  res.json({ progress: record });
});

router.get('/payments', async (req, res) => {
  const payments = await Payment.find({ userId: req.user!.id })
    .select('-processedEvents')
    .populate('courseId', 'title slug currency price')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ payments });
});

router.get('/tickets', async (req, res) => {
  const tickets = await SupportTicket.find({ userId: req.user!.id })
    .populate('courseId', 'title slug')
    .sort({ updatedAt: -1 })
    .lean();
  res.json({ tickets });
});

router.post('/tickets', supportLimiter, async (req, res) => {
  const parsed = supportTicketCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid ticket.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const ref = `NF-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
  const ticket = await SupportTicket.create({
    referenceNumber: ref,
    userId: req.user!.id,
    courseId: parsed.data.courseId || undefined,
    subject: stripHtmlTags(parsed.data.subject),
    category: parsed.data.category,
    description: stripHtmlTags(parsed.data.description),
    status: 'Open',
  });

  await SupportMessage.create({
    ticketId: ticket._id,
    senderId: req.user!.id,
    senderRole: 'learner',
    senderName: req.user!.name,
    message: stripHtmlTags(parsed.data.description),
  });

  await Notification.create({
    targetRole: 'admin',
    title: `New Support Ticket (${ref})`,
    message: `${req.user!.name} submitted "${ticket.subject}" [${ticket.category}]`,
    link: '/portal-admin?tab=support',
  });

  res.status(201).json({ ticket });
});

router.get('/tickets/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ticket identifier.' });
  }
  const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user!.id })
    .populate('courseId', 'title slug')
    .lean();
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  const messages = await SupportMessage.find({ ticketId: req.params.id }).sort({ createdAt: 1 }).lean();
  res.json({ ticket, messages });
});

router.post('/tickets/:id/messages', supportLimiter, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ticket identifier.' });
  }
  const parsed = supportReplySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Message cannot be empty.',
      fieldErrors: zodToFieldErrors(parsed.error),
    });
  }

  const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user!.id });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  const messageText = stripHtmlTags(parsed.data.message);
  if (messageText.length < 2) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }

  const msg = await SupportMessage.create({
    ticketId: ticket._id,
    senderId: req.user!.id,
    senderRole: 'learner',
    senderName: req.user!.name,
    message: messageText,
  });

  if (ticket.status === 'Answered' || ticket.status === 'Closed') {
    ticket.status = 'Open';
    await ticket.save();
  }

  await Notification.create({
    targetRole: 'admin',
    title: `Learner Reply on ${ticket.referenceNumber}`,
    message: `${req.user!.name} replied to "${ticket.subject}".`,
    link: '/portal-admin?tab=support',
  });

  res.status(201).json({ message: msg });
});

router.get('/notifications', async (req, res) => {
  const notifications = await Notification.find({ userId: req.user!.id, targetRole: 'learner' })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json({ notifications });
});

router.patch('/notifications/:id/read', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid notification identifier.' });
  }
  await Notification.updateOne(
    { _id: req.params.id, userId: req.user!.id },
    { $set: { read: true } }
  );
  res.json({ ok: true });
});

export default router;
