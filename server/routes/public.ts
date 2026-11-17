import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { connectDB, getLastDBError, isDBConfigured } from '../db.js';
import {
  DEFAULT_PRODUCTS,
  DEFAULT_SEO_PAGES,
  DEFAULT_SERVICES,
  DEFAULT_SITE_SETTINGS,
} from '../defaults.js';
import { leadLimiter, requireDatabase, stripHtmlTags } from '../middleware/auth.js';
import {
  AnalyticsEvent,
  Article,
  Course,
  CourseReview,
  Lead,
  Lesson,
  Module,
  Notification,
  Product,
  SEOSettings,
  Service,
  SiteSettings,
  Testimonial,
  WorkShowcase,
} from '../models.js';
import { sendTransactionalEmail } from '../utils/email.js';
import { calculateCouponDiscount, validateCouponForPricing } from '../utils/coupons.js';
import { isPaystackConfigured, getPaystackMode } from '../utils/paystack.js';

const router = Router();

async function getCourseCountMaps(courseIds: unknown[]) {
  const moduleMap = new Map<string, number>();
  const lessonMap = new Map<string, number>();
  if (courseIds.length === 0) return { moduleMap, lessonMap };

  const [modRows, lessonRows] = await Promise.all([
    Module.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ]),
    Lesson.aggregate([
      { $match: { courseId: { $in: courseIds }, published: true } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ]),
  ]);

  for (const row of modRows) moduleMap.set(String(row._id), Number(row.count || 0));
  for (const row of lessonRows) lessonMap.set(String(row._id), Number(row.count || 0));
  return { moduleMap, lessonMap };
}

async function getCourseRatingMap(courseIds: unknown[]) {
  if (courseIds.length === 0) return new Map<string, { averageRating: number; reviewCount: number }>();
  const rows = await CourseReview.aggregate([
    { $match: { courseId: { $in: courseIds }, status: 'published' } },
    {
      $group: {
        _id: '$courseId',
        averageRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 },
      },
    },
  ]);
  const map = new Map<string, { averageRating: number; reviewCount: number }>();
  for (const r of rows) {
    map.set(String(r._id), {
      averageRating: Math.round(Number(r.averageRating || 0) * 10) / 10,
      reviewCount: Number(r.reviewCount || 0),
    });
  }
  return map;
}

router.use((req, res, next) => {
  if (req.method === 'GET') {
    if (req.path === '/health') {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    }
  }
  next();
});

router.get('/health', async (_req, res) => {
  const dbConfigured = isDBConfigured();
  let dbConnected = false;
  if (dbConfigured) {
    const conn = await connectDB();
    dbConnected = Boolean(conn);
  }
  const lastErr = getLastDBError();
  res.json({
    status: 'ok',
    database: {
      configured: dbConfigured,
      connected: dbConnected,
      errorCode: dbConnected ? null : lastErr.code,
      error: dbConnected ? null : lastErr.message,
    },
    paystack: { configured: isPaystackConfigured(), mode: getPaystackMode() },
  });
});

router.get('/bootstrap', async (_req, res) => {
  if (!isDBConfigured()) {
    return res.json({
      dbConnected: false,
      settings: DEFAULT_SITE_SETTINGS,
      services: DEFAULT_SERVICES,
      products: DEFAULT_PRODUCTS,
      featuredCourses: [],
      featuredArticles: [],
      workItems: [],
      testimonials: [],
      seoPages: DEFAULT_SEO_PAGES,
    });
  }

  const conn = await connectDB();
  if (!conn) {
    return res.json({
      dbConnected: false,
      settings: DEFAULT_SITE_SETTINGS,
      services: DEFAULT_SERVICES,
      products: DEFAULT_PRODUCTS,
      featuredCourses: [],
      featuredArticles: [],
      workItems: [],
      testimonials: [],
      seoPages: DEFAULT_SEO_PAGES,
    });
  }

  const [settings, services, products, courses, articles, seoPages, workItems, testimonials] =
    await Promise.all([
      SiteSettings.findOne({ key: 'main' }).lean(),
      Service.find({ published: true }).sort({ order: 1, createdAt: 1 }).lean(),
      Product.find({ published: true }).sort({ order: 1, createdAt: 1 }).lean(),
      Course.find({ published: true }).sort({ order: 1, createdAt: -1 }).limit(6).lean(),
      Article.find({ status: 'published' })
        .sort({ publishedAt: -1, createdAt: -1 })
        .limit(3)
        .select('title slug excerpt featuredImage category tags authorName publishedAt readingTimeMinutes')
        .lean(),
      SEOSettings.find().lean(),
      WorkShowcase.find({ published: true }).sort({ featured: -1, order: 1, createdAt: -1 }).limit(6).lean(),
      Testimonial.find({ published: true }).sort({ featured: -1, order: 1, createdAt: -1 }).limit(6).lean(),
    ]);

  const courseIds = courses.map((c: Record<string, unknown>) => c._id);
  const [ratingMap, { moduleMap, lessonMap }] = await Promise.all([
    getCourseRatingMap(courseIds),
    getCourseCountMaps(courseIds),
  ]);

  const enrichedCourses = courses.map((c: Record<string, unknown>) => {
    const idStr = String(c._id);
    const rating = ratingMap.get(idStr) || { averageRating: 0, reviewCount: 0 };
    return {
      ...c,
      moduleCount: moduleMap.get(idStr) || 0,
      lessonCount: lessonMap.get(idStr) || 0,
      ...rating,
    };
  });

  res.json({
    dbConnected: true,
    settings: settings ? { ...DEFAULT_SITE_SETTINGS, ...settings } : DEFAULT_SITE_SETTINGS,
    services,
    products,
    featuredCourses: enrichedCourses,
    featuredArticles: articles,
    workItems,
    testimonials,
    seoPages,
  });
});

router.get('/services', async (_req, res) => {
  if (!isDBConfigured() || !(await connectDB())) {
    return res.json({ services: DEFAULT_SERVICES });
  }
  const services = await Service.find({ published: true }).sort({ order: 1, createdAt: 1 }).lean();
  res.json({ services });
});

router.get('/services/:slug', async (req, res) => {
  const { slug } = req.params;
  if (!isDBConfigured() || !(await connectDB())) {
    const found = DEFAULT_SERVICES.find((s) => s.slug === slug);
    if (!found) return res.status(404).json({ error: 'Service not found.' });
    return res.json({ service: found });
  }
  const service = await Service.findOne({ slug, published: true }).lean();
  if (!service) return res.status(404).json({ error: 'Service not found.' });
  res.json({ service });
});

router.get('/products', async (_req, res) => {
  if (!isDBConfigured() || !(await connectDB())) {
    return res.json({ products: DEFAULT_PRODUCTS });
  }
  const products = await Product.find({ published: true }).sort({ order: 1, createdAt: 1 }).lean();
  res.json({ products });
});

router.get('/products/:slug', async (req, res) => {
  const { slug } = req.params;
  if (!isDBConfigured() || !(await connectDB())) {
    const found = DEFAULT_PRODUCTS.find((p) => p.slug === slug);
    if (!found) return res.status(404).json({ error: 'Product not found.' });
    return res.json({ product: found });
  }
  const product = await Product.findOne({ slug, published: true }).lean();
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json({ product });
});

router.get('/courses', async (_req, res) => {
  if (!isDBConfigured() || !(await connectDB())) {
    return res.json({ courses: [] });
  }
  const courses = await Course.find({ published: true }).sort({ order: 1, createdAt: -1 }).lean();
  const courseIds = courses.map((c: Record<string, unknown>) => c._id);
  const [ratingMap, { moduleMap, lessonMap }] = await Promise.all([
    getCourseRatingMap(courseIds),
    getCourseCountMaps(courseIds),
  ]);
  const enriched = courses.map((c: Record<string, unknown>) => {
    const idStr = String(c._id);
    const rating = ratingMap.get(idStr) || { averageRating: 0, reviewCount: 0 };
    return {
      ...c,
      moduleCount: moduleMap.get(idStr) || 0,
      lessonCount: lessonMap.get(idStr) || 0,
      ...rating,
    };
  });
  res.json({ courses: enriched });
});

function matchesSearchTokens(fields: Array<string | string[] | undefined | null>, tokens: string[]) {
  if (tokens.length === 0) return true;
  const haystack = fields
    .flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .join(' ')
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

router.get('/search', async (req, res) => {
  try {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const tokens = rawQuery
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (!isDBConfigured() || !(await connectDB())) {
      const solutions = DEFAULT_SERVICES.filter((s) =>
        matchesSearchTokens([s.name, s.shortDescription, s.overview, s.problemsAddressed, s.deliverables], tokens)
      )
        .slice(0, 6)
        .map((s) => ({
          name: s.name,
          slug: s.slug,
          shortDescription: s.shortDescription,
        }));

      const products = DEFAULT_PRODUCTS.filter((p) =>
        matchesSearchTokens(
          [p.name, p.category, p.shortDescription, p.fullDescription, p.features, p.benefits, p.pricingStatus],
          tokens
        )
      )
        .slice(0, 6)
        .map((p) => ({
          name: p.name,
          slug: p.slug,
          category: p.category,
          shortDescription: p.shortDescription,
          pricingStatus: p.pricingStatus,
        }));

      return res.json({ query: rawQuery, solutions, products, courses: [] });
    }

    const [services, products, courses] = await Promise.all([
      Service.find({ published: true })
        .sort({ order: 1, createdAt: 1 })
        .select('name slug shortDescription overview problemsAddressed deliverables focusKeyword')
        .lean(),
      Product.find({ published: true })
        .sort({ order: 1, createdAt: 1 })
        .select('name slug category shortDescription fullDescription features benefits pricingStatus focusKeyword')
        .lean(),
      Course.find({ published: true })
        .sort({ order: 1, createdAt: -1 })
        .select('title slug shortDescription fullDescription objectives outcomes price currency focusKeyword')
        .lean(),
    ]);

    const matchedSolutions = services
      .filter((s: Record<string, unknown>) =>
        matchesSearchTokens(
          [
            s.name as string,
            s.shortDescription as string,
            s.overview as string,
            s.problemsAddressed as string[],
            s.deliverables as string[],
            s.focusKeyword as string,
          ],
          tokens
        )
      )
      .slice(0, 6)
      .map((s: Record<string, unknown>) => ({
        _id: s._id,
        name: s.name,
        slug: s.slug,
        shortDescription: s.shortDescription,
      }));

    const matchedProducts = products
      .filter((p: Record<string, unknown>) =>
        matchesSearchTokens(
          [
            p.name as string,
            p.category as string,
            p.shortDescription as string,
            p.fullDescription as string,
            p.features as string[],
            p.benefits as string[],
            p.pricingStatus as string,
            p.focusKeyword as string,
          ],
          tokens
        )
      )
      .slice(0, 6)
      .map((p: Record<string, unknown>) => ({
        _id: p._id,
        name: p.name,
        slug: p.slug,
        category: p.category,
        shortDescription: p.shortDescription,
        pricingStatus: p.pricingStatus,
      }));

    const matchedCourses = courses
      .filter((c: Record<string, unknown>) =>
        matchesSearchTokens(
          [
            c.title as string,
            c.shortDescription as string,
            c.fullDescription as string,
            c.objectives as string[],
            c.outcomes as string[],
            c.focusKeyword as string,
          ],
          tokens
        )
      )
      .slice(0, 6)
      .map((c: Record<string, unknown>) => ({
        _id: c._id,
        title: c.title,
        slug: c.slug,
        shortDescription: c.shortDescription,
        price: c.price,
        currency: c.currency,
      }));

    return res.json({
      query: rawQuery,
      solutions: matchedSolutions,
      products: matchedProducts,
      courses: matchedCourses,
    });
  } catch (err) {
    console.error('[Public Search] Error:', err);
    return res.status(500).json({ error: 'Unable to complete search right now.' });
  }
});

router.get('/courses/:slug', async (req, res) => {
  if (!isDBConfigured() || !(await connectDB())) {
    return res.status(404).json({ error: 'Course not found.' });
  }
  const course = await Course.findOne({ slug: req.params.slug, published: true }).lean();
  if (!course) return res.status(404).json({ error: 'Course not found.' });

  const courseObj = course as Record<string, unknown>;
  const [modules, lessons, reviews] = await Promise.all([
    Module.find({ courseId: courseObj._id }).sort({ order: 1 }).lean(),
    // Explicitly omit youtubeUrl on public preview endpoint
    Lesson.find({ courseId: courseObj._id, published: true })
      .sort({ order: 1 })
      .select('_id moduleId title duration order')
      .lean(),
    CourseReview.find({ courseId: courseObj._id, status: 'published' })
      .sort({ createdAt: -1 })
      .select('_id courseId authorName rating title comment completedCourse status createdAt')
      .lean(),
  ]);

  const curriculum = modules.map((mod: Record<string, unknown>) => ({
    ...mod,
    lessons: lessons.filter((l: Record<string, unknown>) => String(l.moduleId) === String(mod._id)),
  }));

  const reviewCount = reviews.length;
  const averageRating =
    reviewCount > 0
      ? Math.round(
          (reviews.reduce((sum, r) => sum + Number((r as { rating?: number }).rating || 0), 0) /
            reviewCount) *
            10
        ) / 10
      : 0;

  res.json({
    course: {
      ...courseObj,
      moduleCount: modules.length,
      lessonCount: lessons.length,
      averageRating,
      reviewCount,
    },
    curriculum,
    reviews,
  });
});

router.post('/coupons/validate', requireDatabase, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim();
    const courseId = req.body?.courseId ? String(req.body.courseId).trim() : undefined;

    const result = await validateCouponForPricing({ code, courseId });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    let pricing: ReturnType<typeof calculateCouponDiscount> | null = null;
    if (courseId) {
      const course = await Course.findOne({ _id: courseId, published: true })
        .select('price currency title')
        .lean();
      if (course) {
        pricing = calculateCouponDiscount(
          Number((course as { price?: number }).price || 0),
          result.coupon.discountPercent
        );
      }
    }

    return res.json({ ok: true, coupon: result.coupon, pricing });
  } catch (err) {
    console.error('[Public Coupon Validate] Error:', err);
    return res.status(500).json({ error: 'Unable to validate coupon code right now.' });
  }
});

router.get('/work', async (_req, res) => {
  if (!isDBConfigured() || !(await connectDB())) {
    return res.json({ workItems: [] });
  }
  const workItems = await WorkShowcase.find({ published: true })
    .sort({ featured: -1, order: 1, createdAt: -1 })
    .lean();
  res.json({ workItems });
});

router.get('/testimonials', async (_req, res) => {
  if (!isDBConfigured() || !(await connectDB())) {
    return res.json({ testimonials: [] });
  }
  const testimonials = await Testimonial.find({ published: true })
    .sort({ featured: -1, order: 1, createdAt: -1 })
    .lean();
  res.json({ testimonials });
});

router.get('/articles', async (req, res) => {
  if (!isDBConfigured() || !(await connectDB())) {
    return res.json({ articles: [], categories: [] });
  }
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const filter: Record<string, unknown> = { status: 'published' };
  if (category && category !== 'All') {
    filter.category = category;
  }
  const [articles, allCats] = await Promise.all([
    Article.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .select(
        'title slug excerpt featuredImage category tags authorName publishedAt readingTimeMinutes'
      )
      .lean(),
    Article.distinct('category', { status: 'published' }),
  ]);
  res.json({ articles, categories: allCats });
});

router.get('/articles/:slug', async (req, res) => {
  if (!isDBConfigured() || !(await connectDB())) {
    return res.status(404).json({ error: 'Article not found.' });
  }
  const article = await Article.findOne({ slug: req.params.slug, status: 'published' }).lean();
  if (!article) return res.status(404).json({ error: 'Article not found.' });

  const artObj = article as Record<string, unknown>;
  const related = await Article.find({
    status: 'published',
    _id: { $ne: artObj._id },
    category: artObj.category,
  })
    .sort({ publishedAt: -1 })
    .limit(3)
    .select('title slug excerpt featuredImage category publishedAt readingTimeMinutes')
    .lean();

  res.json({ article, related });
});

const leadSchema = z.object({
  fullName: z.string().trim().min(2, 'Please provide your full name.').max(140),
  email: z.string().trim().email('Please provide a valid email address.').max(180),
  phone: z.string().trim().max(50).optional().default(''),
  company: z.string().trim().max(160).optional().default(''),
  interestType: z.enum(['service', 'product', 'course', 'consultation', 'general']),
  interestSlug: z.string().trim().max(120).optional().default(''),
  interestName: z.string().trim().min(2).max(180),
  description: z.string().trim().min(10, 'Please describe your requirements (min 10 chars).').max(4000),
  budgetRange: z.string().trim().max(100).optional().default(''),
  preferredContact: z.enum(['Email', 'Phone', 'WhatsApp']).default('Email'),
  consentGiven: z.literal(true, { message: 'Consent is required to submit.' }),
  source: z.string().trim().max(120).optional().default('website'),
  landingPage: z.string().trim().max(500).optional().default(''),
  referringUrl: z.string().trim().max(500).optional().default(''),
  utmSource: z.string().trim().max(120).optional().default(''),
  utmMedium: z.string().trim().max(120).optional().default(''),
  utmCampaign: z.string().trim().max(120).optional().default(''),
  utmTerm: z.string().trim().max(120).optional().default(''),
  utmContent: z.string().trim().max(120).optional().default(''),
  website_hp: z.string().optional().default(''), // honeypot
});

router.post('/leads', leadLimiter, requireDatabase, async (req, res) => {
  const parsed = leadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid enquiry data.',
    });
  }

  const data = parsed.data;
  // Honeypot triggered: silently accept without saving
  if (data.website_hp && data.website_hp.trim().length > 0) {
    return res.status(201).json({ ok: true, message: 'Thank you. Your enquiry has been received.' });
  }

  const fingerprint = crypto
    .createHash('sha256')
    .update(`${data.email.toLowerCase()}|${data.interestName}|${data.description.slice(0, 120)}`)
    .digest('hex');

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const duplicate = await Lead.findOne({
    fingerprint,
    createdAt: { $gte: tenMinutesAgo },
  }).lean();

  if (duplicate) {
    return res.status(429).json({
      error: 'This enquiry was already submitted recently. Our team has received it.',
    });
  }

  const lead = await Lead.create({
    fullName: stripHtmlTags(data.fullName),
    email: data.email.toLowerCase(),
    phone: stripHtmlTags(data.phone),
    company: stripHtmlTags(data.company),
    interestType: data.interestType,
    interestSlug: stripHtmlTags(data.interestSlug),
    interestName: stripHtmlTags(data.interestName),
    description: stripHtmlTags(data.description),
    budgetRange: stripHtmlTags(data.budgetRange),
    preferredContact: data.preferredContact,
    consentGiven: true,
    consentTimestamp: new Date(),
    source: stripHtmlTags(data.source || (data.utmSource ? data.utmSource : 'direct')),
    landingPage: stripHtmlTags(data.landingPage),
    referringUrl: stripHtmlTags(data.referringUrl),
    utmSource: stripHtmlTags(data.utmSource),
    utmMedium: stripHtmlTags(data.utmMedium),
    utmCampaign: stripHtmlTags(data.utmCampaign),
    utmTerm: stripHtmlTags(data.utmTerm),
    utmContent: stripHtmlTags(data.utmContent),
    status: 'New',
    fingerprint,
  });

  await Notification.create({
    targetRole: 'admin',
    title: `New Enquiry: ${lead.interestName}`,
    message: `${lead.fullName} (${lead.email}) submitted an enquiry via ${lead.source}.`,
    link: '/portal-admin?tab=crm',
  });

  const settings = await SiteSettings.findOne({ key: 'main' }).lean();
  const businessEmail = (settings as { email?: string } | null)?.email;
  if (businessEmail) {
    await sendTransactionalEmail({
      to: businessEmail,
      subject: `[NexaFlow Lead] ${lead.interestName} — ${lead.fullName}`,
      text: `New enquiry received:\nName: ${lead.fullName}\nEmail: ${lead.email}\nPhone: ${lead.phone || '-'}\nInterest: ${lead.interestName}\nSource: ${lead.source}\n\n${lead.description}`,
    });
  }

  res.status(201).json({
    ok: true,
    message: 'Thank you. Your enquiry has been recorded and will be reviewed shortly.',
  });
});

router.post('/analytics', async (req, res) => {
  if (!isDBConfigured() || !(await connectDB())) {
    return res.json({ ok: true });
  }
  const { eventType, path, entitySlug, referrer, utmSource } = req.body || {};
  if (typeof eventType !== 'string' || eventType.length > 80) {
    return res.status(400).json({ error: 'Invalid event' });
  }
  await AnalyticsEvent.create({
    eventType: stripHtmlTags(eventType),
    path: stripHtmlTags(String(path || '/').slice(0, 200)),
    entitySlug: stripHtmlTags(String(entitySlug || '').slice(0, 120)),
    referrer: stripHtmlTags(String(referrer || '').slice(0, 300)),
    utmSource: stripHtmlTags(String(utmSource || '').slice(0, 100)),
  });
  res.json({ ok: true });
});

export default router;
