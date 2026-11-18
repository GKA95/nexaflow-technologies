import { Request } from 'express';
import { connectDB, isDBConfigured } from '../db.js';
import {
  DEFAULT_PRODUCTS,
  DEFAULT_SEO_PAGES,
  DEFAULT_SERVICES,
  DEFAULT_SITE_SETTINGS,
} from '../defaults.js';
import {
  createAsyncRouter,
  getBaseUrl as resolveRequestBaseUrl,
  stripHtmlTags,
} from '../middleware/auth.js';
import {
  Article,
  Course,
  CourseReview,
  Lesson,
  Module,
  Product,
  SEOSettings,
  Service,
  SiteSettings,
} from '../models.js';

const router = createAsyncRouter();

type SeoEntityType =
  | 'home'
  | 'page'
  | 'legal'
  | 'lms_catalog'
  | 'course'
  | 'product_catalog'
  | 'product'
  | 'service_catalog'
  | 'service'
  | 'article_catalog'
  | 'article'
  | 'private'
  | 'not_found';

type SeoQueryType = 'page' | 'course' | 'product' | 'service' | 'article';

const ALLOWED_QUERY_TYPES = new Set<SeoQueryType>([
  'page',
  'course',
  'product',
  'service',
  'article',
]);

const LEGAL_PAGE_LABELS: Record<string, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  cookies: 'Cookie & Analytics Notice',
  refund: 'Course & Refund Policy',
};

const STATIC_PAGE_DEFAULTS: Record<string, { titleSuffixLabel: string; schemaType?: string }> = {
  about: { titleSuffixLabel: 'About', schemaType: 'AboutPage' },
  solutions: { titleSuffixLabel: 'Solutions & Services', schemaType: 'CollectionPage' },
  products: { titleSuffixLabel: 'Products & Platforms', schemaType: 'CollectionPage' },
  learn: {
    titleSuffixLabel: 'NexaFlow Learn | Practical AI, Data & Engineering Courses',
    schemaType: 'CollectionPage',
  },
  insights: { titleSuffixLabel: 'Insights & Engineering Articles', schemaType: 'CollectionPage' },
  contact: { titleSuffixLabel: 'Contact & Consultation', schemaType: 'ContactPage' },
};

function getBaseUrl(req: Request, canonicalOverride?: string): string {
  if (canonicalOverride?.trim()) {
    return canonicalOverride.trim().replace(/\/+$/, '');
  }
  return resolveRequestBaseUrl(req);
}

function cleanText(value: unknown, maxLen = 500): string {
  if (typeof value !== 'string') return '';
  return stripHtmlTags(value).replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function normalizeSeoPath(rawPath: unknown): string {
  if (typeof rawPath !== 'string') return '/';
  const withoutCtrl = rawPath.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  const pathPart = withoutCtrl.split('?')[0]?.split('#')[0] || '/';
  const withLeadingSlash = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
  if (collapsed === '/') return '/';
  return collapsed.replace(/\/+$/, '');
}

function normalizeSlug(rawSlug: unknown): string {
  if (typeof rawSlug !== 'string') return '';
  return rawSlug
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .slice(0, 180);
}

function resolveAbsoluteAssetUrl(
  value: string | undefined,
  baseUrl: string,
  fallbackPath: string
): string {
  const trimmed = value?.trim();
  if (!trimmed) return `${baseUrl}${fallbackPath}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${baseUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function normalizeKeywords(...inputs: Array<string | string[] | undefined>): string {
  const items: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (Array.isArray(input)) {
      for (const entry of input) {
        const cleaned = cleanText(entry, 100);
        if (cleaned) items.push(cleaned);
      }
    } else if (typeof input === 'string') {
      for (const part of input.split(',')) {
        const cleaned = cleanText(part, 100);
        if (cleaned) items.push(cleaned);
      }
    }
  }
  return Array.from(new Set(items)).join(', ');
}

function resolveEffectiveCanonical(
  explicitCanonical: string | undefined,
  baseUrl: string,
  path: string
): string {
  const trimmed = explicitCanonical?.trim();
  if (!trimmed) return `${baseUrl}${path}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${baseUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

async function getCourseSeoStatsMap(courseIds: unknown[]) {
  const stats = new Map<
    string,
    { moduleCount: number; lessonCount: number; averageRating: number; reviewCount: number }
  >();
  if (courseIds.length === 0) return stats;

  const [modRows, lessonRows, reviewRows] = await Promise.all([
    Module.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ]),
    Lesson.aggregate([
      { $match: { courseId: { $in: courseIds }, published: true } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ]),
    CourseReview.aggregate([
      { $match: { courseId: { $in: courseIds }, status: 'published' } },
      {
        $group: {
          _id: '$courseId',
          averageRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  const ensure = (id: string) => {
    let existing = stats.get(id);
    if (!existing) {
      existing = { moduleCount: 0, lessonCount: 0, averageRating: 0, reviewCount: 0 };
      stats.set(id, existing);
    }
    return existing;
  };

  for (const row of modRows) {
    ensure(String(row._id)).moduleCount = Number(row.count || 0);
  }
  for (const row of lessonRows) {
    ensure(String(row._id)).lessonCount = Number(row.count || 0);
  }
  for (const row of reviewRows) {
    const entry = ensure(String(row._id));
    entry.averageRating = Math.round(Number(row.averageRating || 0) * 10) / 10;
    entry.reviewCount = Number(row.reviewCount || 0);
  }

  return stats;
}

function buildProductOfferSchema(pricingStatus: string | undefined): Record<string, unknown> | null {
  const raw = cleanText(pricingStatus, 120);
  if (!raw) return null;
  const priceMatch = raw.match(/(?:GHS|USD|EUR|GBP|\$)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
  if (!priceMatch?.[1]) return null;
  const currency = /USD|\$/i.test(raw)
    ? 'USD'
    : /EUR/i.test(raw)
      ? 'EUR'
      : /GBP/i.test(raw)
        ? 'GBP'
        : 'GHS';
  return {
    '@type': 'Offer',
    price: Number(priceMatch[1]),
    priceCurrency: currency,
    availability: 'https://schema.org/InStock',
  };
}

function buildCourseJsonLd(params: {
  course: Record<string, unknown>;
  baseUrl: string;
  canonicalUrl: string;
  siteName: string;
  description: string;
  ogImage: string;
  stats?: { moduleCount: number; lessonCount: number; averageRating: number; reviewCount: number };
}): Record<string, unknown> {
  const { course, baseUrl, canonicalUrl, siteName, description, ogImage, stats } = params;
  const title = cleanText(course.title, 180);
  const price = Number(course.price || 0);
  const currency = cleanText(course.currency, 10).toUpperCase() || 'GHS';

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: title,
    description,
    url: canonicalUrl,
    image: ogImage,
    provider: {
      '@type': 'Organization',
      name: siteName,
      sameAs: baseUrl,
    },
    offers: {
      '@type': 'Offer',
      price,
      priceCurrency: currency,
      availability: 'https://schema.org/InStock',
      url: canonicalUrl,
    },
  };

  if (stats && stats.lessonCount > 0) {
    schema.numberOfCredits = stats.moduleCount;
    schema.hasCourseInstance = {
      '@type': 'CourseInstance',
      courseMode: 'online',
      courseWorkload: `${stats.moduleCount} modules · ${stats.lessonCount} lessons`,
    };
  }

  if (stats && stats.reviewCount > 0 && stats.averageRating > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: stats.averageRating,
      reviewCount: stats.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return schema;
}

function buildProductJsonLd(params: {
  product: Record<string, unknown>;
  canonicalUrl: string;
  siteName: string;
  description: string;
  ogImage: string;
}): Record<string, unknown> {
  const { product, canonicalUrl, siteName, description, ogImage } = params;
  const offer = buildProductOfferSchema(
    typeof product.pricingStatus === 'string' ? product.pricingStatus : ''
  );
  const features = Array.isArray(product.features)
    ? product.features.map((f) => cleanText(f, 160)).filter(Boolean)
    : [];

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: cleanText(product.name, 160),
    applicationCategory: cleanText(product.category, 100) || 'BusinessApplication',
    operatingSystem: 'Web',
    description,
    image: ogImage,
    url: canonicalUrl,
    brand: {
      '@type': 'Organization',
      name: siteName,
    },
    ...(features.length > 0 ? { featureList: features } : {}),
    ...(offer ? { offers: offer } : {}),
  };
}

async function resolveSiteContext(req: Request) {
  const dbReady = isDBConfigured() && Boolean(await connectDB());
  let dbSettings: Record<string, unknown> | null = null;
  if (dbReady) {
    dbSettings = (await SiteSettings.findOne({ key: 'main' }).lean()) as Record<
      string,
      unknown
    > | null;
  }

  const merged: Record<string, unknown> = {
    ...DEFAULT_SITE_SETTINGS,
    ...(dbSettings || {}),
  };

  const baseUrl = getBaseUrl(
    req,
    typeof merged.seoCanonicalBaseUrl === 'string' ? merged.seoCanonicalBaseUrl : ''
  );
  const siteName = cleanText(merged.businessName, 120) || 'NexaFlow Technologies';
  const titleSuffix = cleanText(merged.seoTitleSuffix, 120) || siteName;
  const globalTitle =
    cleanText(merged.seoSiteTitle, 200) || `${siteName} | AI, Data & Digital Solutions`;
  const globalDescription =
    cleanText(merged.seoDefaultDescription, 400) ||
    'NexaFlow Technologies delivers AI automation, web development, data analytics, machine learning, and structured technical training.';
  const globalKeywords = normalizeKeywords(
    typeof merged.seoDefaultKeywords === 'string' ? merged.seoDefaultKeywords : ''
  );
  const globalOgTitle = cleanText(merged.seoOgTitle, 200) || '';
  const globalOgDescription = cleanText(merged.seoOgDescription, 400) || '';
  const globalOgImage = resolveAbsoluteAssetUrl(
    typeof merged.seoOgImage === 'string' ? merged.seoOgImage : '',
    baseUrl,
    '/og-image.png'
  );
  const twitterCard =
    merged.seoTwitterCard === 'summary' ? ('summary' as const) : ('summary_large_image' as const);
  const twitterSite = cleanText(merged.seoTwitterSite, 80);
  const globalNoIndex = merged.seoRobotsDefault === 'noindex, nofollow';
  const structuredDataEnabled = merged.seoStructuredDataEnabled !== false;
  const gscVerificationTag = cleanText(merged.gscVerificationTag, 200);
  const socialLinksRaw = (merged.socialLinks || {}) as Record<string, unknown>;
  const socialSameAs = Object.values(socialLinksRaw)
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => /^https?:\/\//i.test(u));

  return {
    dbReady,
    baseUrl,
    siteName,
    titleSuffix,
    globalTitle,
    globalDescription,
    globalKeywords,
    globalOgTitle,
    globalOgDescription,
    globalOgImage,
    twitterCard,
    twitterSite,
    globalNoIndex,
    structuredDataEnabled,
    gscVerificationTag,
    socialSameAs,
  };
}

router.get('/robots.txt', async (req, res) => {
  let canonicalOverride = '';
  if (isDBConfigured() && (await connectDB())) {
    const s = (await SiteSettings.findOne({ key: 'main' })
      .select('seoCanonicalBaseUrl')
      .lean()) as { seoCanonicalBaseUrl?: string } | null;
    canonicalOverride = s?.seoCanonicalBaseUrl || '';
  }
  const baseUrl = getBaseUrl(req, canonicalOverride);
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /portal-admin',
      'Disallow: /learner',
      'Disallow: /auth',
      'Disallow: /api/',
      '',
      `Sitemap: ${baseUrl}/sitemap.xml`,
    ].join('\n')
  );
});

router.get('/sitemap.xml', async (req, res) => {
  let baseUrl = getBaseUrl(req);

  const staticPaths = [
    '/',
    '/about',
    '/solutions',
    '/products',
    '/learn',
    '/insights',
    '/contact',
    '/legal/privacy',
    '/legal/terms',
    '/legal/cookies',
    '/legal/refund',
  ];

  const urls: Array<{ loc: string; lastmod?: string; priority: string }> = [];

  let noIndexKeys = new Set<string>();
  let services: Array<{ slug: string; updatedAt?: Date; noIndex?: boolean }> = DEFAULT_SERVICES;
  let products: Array<{ slug: string; updatedAt?: Date; noIndex?: boolean }> = DEFAULT_PRODUCTS;
  let courses: Array<{ slug: string; updatedAt?: Date; noIndex?: boolean }> = [];
  let articles: Array<{ slug: string; updatedAt?: Date; publishedAt?: Date; noIndex?: boolean }> = [];

  if (isDBConfigured() && (await connectDB())) {
    const [siteSettings, dbSeo, dbServices, dbProducts, dbCourses, dbArticles] = await Promise.all([
      SiteSettings.findOne({ key: 'main' }).select('seoCanonicalBaseUrl').lean(),
      SEOSettings.find({ noIndex: true }).select('pageKey').lean(),
      Service.find({ published: true }).select('slug updatedAt noIndex').lean(),
      Product.find({ published: true }).select('slug updatedAt noIndex').lean(),
      Course.find({ published: true }).select('slug updatedAt noIndex').lean(),
      Article.find({ status: 'published' })
        .select('slug updatedAt publishedAt noIndex')
        .lean(),
    ]);
    const canonicalOverride = (siteSettings as { seoCanonicalBaseUrl?: string } | null)
      ?.seoCanonicalBaseUrl;
    if (canonicalOverride?.trim()) {
      baseUrl = getBaseUrl(req, canonicalOverride);
    }
    noIndexKeys = new Set(dbSeo.map((s: Record<string, unknown>) => String(s.pageKey)));
    services = (dbServices as typeof services).filter((s) => s.noIndex !== true);
    products = (dbProducts as typeof products).filter((p) => p.noIndex !== true);
    courses = (dbCourses as typeof courses).filter((c) => c.noIndex !== true);
    articles = (dbArticles as typeof articles).filter((a) => a.noIndex !== true);
  }

  for (const path of staticPaths) {
    const key = path === '/' ? 'home' : path.replace(/^\//, '');
    if (!noIndexKeys.has(key)) {
      urls.push({
        loc: `${baseUrl}${path}`,
        priority: path === '/' ? '1.0' : '0.8',
      });
    }
  }

  for (const s of services) {
    urls.push({
      loc: `${baseUrl}/solutions/${s.slug}`,
      lastmod: s.updatedAt ? new Date(s.updatedAt).toISOString() : undefined,
      priority: '0.85',
    });
  }

  for (const p of products) {
    urls.push({
      loc: `${baseUrl}/products/${p.slug}`,
      lastmod: p.updatedAt ? new Date(p.updatedAt).toISOString() : undefined,
      priority: '0.8',
    });
  }

  for (const c of courses) {
    urls.push({
      loc: `${baseUrl}/learn/${c.slug}`,
      lastmod: c.updatedAt ? new Date(c.updatedAt).toISOString() : undefined,
      priority: '0.85',
    });
  }

  for (const a of articles) {
    const dt = a.updatedAt || a.publishedAt;
    urls.push({
      loc: `${baseUrl}/insights/${a.slug}`,
      lastmod: dt ? new Date(dt).toISOString() : undefined,
      priority: '0.75',
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  res.type('application/xml').send(xml);
});

/**
 * GET /api/seo/metadata
 * Dynamically resolves page, LMS course, product, service, or article SEO metadata
 * and Schema.org JSON-LD directly from MongoDB (with graceful defaults when DB is offline).
 *
 * Query params:
 *   - path: route pathname (e.g. /learn/ai-engineering, /products/gridmind-ai, /learn)
 *   - OR type (page|course|product|service|article) + slug / pageKey
 */
router.get('/api/seo/metadata', async (req, res) => {
  try {
    const rawType = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : '';
    if (rawType && !ALLOWED_QUERY_TYPES.has(rawType as SeoQueryType)) {
      return res.status(400).json({
        error: 'Invalid SEO metadata type. Allowed values: page, course, product, service, article.',
      });
    }

    const explicitSlug = normalizeSlug(req.query.slug);
    const explicitPageKey = normalizeSlug(req.query.pageKey);

    let targetPath = normalizeSeoPath(req.query.path);
    if (!req.query.path && rawType) {
      if (rawType === 'course') {
        targetPath = explicitSlug ? `/learn/${explicitSlug}` : '/learn';
      } else if (rawType === 'product') {
        targetPath = explicitSlug ? `/products/${explicitSlug}` : '/products';
      } else if (rawType === 'service') {
        targetPath = explicitSlug ? `/solutions/${explicitSlug}` : '/solutions';
      } else if (rawType === 'article') {
        targetPath = explicitSlug ? `/insights/${explicitSlug}` : '/insights';
      } else if (rawType === 'page') {
        const key = explicitPageKey || explicitSlug || 'home';
        targetPath = key === 'home' ? '/' : `/${key}`;
      }
    }

    const ctx = await resolveSiteContext(req);
    const defaultSeoMap = new Map(DEFAULT_SEO_PAGES.map((p) => [p.pageKey, p]));

    const lookupPageSeo = async (pageKey: string) => {
      if (ctx.dbReady) {
        const doc = (await SEOSettings.findOne({ pageKey }).lean()) as Record<
          string,
          unknown
        > | null;
        if (doc) return doc;
      }
      return (defaultSeoMap.get(pageKey) as Record<string, unknown> | undefined) || null;
    };

    let found = true;
    let entityType: SeoEntityType = 'page';
    let pageKey = targetPath === '/' ? 'home' : targetPath.replace(/^\//, '');
    let slug = '';
    let updatedAt: string | null = null;
    let entitySummary: Record<string, unknown> | null = null;

    let title = ctx.globalTitle;
    let description = ctx.globalDescription;
    let canonicalUrl = `${ctx.baseUrl}${targetPath}`;
    let ogTitle = ctx.globalOgTitle;
    let ogDescription = ctx.globalOgDescription;
    let ogImage = ctx.globalOgImage;
    let ogType: 'website' | 'article' = 'website';
    let keywords = ctx.globalKeywords;
    let noIndex = ctx.globalNoIndex;
    let structuredData: Record<string, unknown> | Array<Record<string, unknown>> | null = null;

    const applyPageSeoRecord = (
      seoDoc: Record<string, unknown> | null,
      fallbackTitle: string,
      fallbackDescription: string
    ) => {
      title = cleanText(seoDoc?.title, 200) || fallbackTitle;
      description = cleanText(seoDoc?.description, 400) || fallbackDescription;
      canonicalUrl = resolveEffectiveCanonical(
        typeof seoDoc?.canonicalUrl === 'string' ? seoDoc.canonicalUrl : '',
        ctx.baseUrl,
        targetPath
      );
      ogTitle = cleanText(seoDoc?.ogTitle, 200) || ctx.globalOgTitle;
      ogDescription = cleanText(seoDoc?.ogDescription, 400) || ctx.globalOgDescription;
      ogImage =
        typeof seoDoc?.ogImage === 'string' && seoDoc.ogImage.trim()
          ? resolveAbsoluteAssetUrl(seoDoc.ogImage, ctx.baseUrl, '/og-image.png')
          : ctx.globalOgImage;
      keywords =
        normalizeKeywords(typeof seoDoc?.focusKeyword === 'string' ? seoDoc.focusKeyword : '') ||
        ctx.globalKeywords;
      noIndex = seoDoc?.noIndex !== undefined ? Boolean(seoDoc.noIndex) : ctx.globalNoIndex;
      if (seoDoc?.updatedAt) {
        updatedAt = new Date(seoDoc.updatedAt as string | Date).toISOString();
      }
    };

    if (
      targetPath === '/portal-admin' ||
      targetPath.startsWith('/portal-admin/') ||
      targetPath === '/learner' ||
      targetPath.startsWith('/learner/') ||
      targetPath === '/auth' ||
      targetPath.startsWith('/auth/')
    ) {
      entityType = 'private';
      noIndex = true;
      structuredData = null;
      if (targetPath.startsWith('/portal-admin')) {
        title = `Administrator Portal | ${ctx.titleSuffix}`;
        description = `Protected ${ctx.siteName} administrator management portal.`;
      } else if (targetPath.startsWith('/learner')) {
        title = 'Learner Portal | NexaFlow Learn';
        description = 'Access your enrolled courses, lesson progress, and support tickets.';
      } else {
        title = 'Account Access | NexaFlow Learn';
        description = 'Sign in, create a learner account, or reset your NexaFlow Learn password.';
      }
    } else if (targetPath === '/') {
      entityType = 'home';
      pageKey = 'home';
      const seoDoc = await lookupPageSeo('home');
      applyPageSeoRecord(seoDoc, ctx.globalTitle, ctx.globalDescription);
      ogTitle = cleanText(seoDoc?.ogTitle, 200) || title;
      ogDescription = cleanText(seoDoc?.ogDescription, 400) || description;
      structuredData = [
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: ctx.siteName,
          url: ctx.baseUrl,
          description,
          logo: resolveAbsoluteAssetUrl('/favicon.svg', ctx.baseUrl, '/favicon.svg'),
          ...(ctx.socialSameAs.length > 0 ? { sameAs: ctx.socialSameAs } : {}),
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: ctx.siteName,
          url: ctx.baseUrl,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${ctx.baseUrl}/learn?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
      ];
    } else if (targetPath === '/learn') {
      entityType = 'lms_catalog';
      pageKey = 'learn';
      const [seoDoc, publishedCourses] = await Promise.all([
        lookupPageSeo('learn'),
        ctx.dbReady
          ? Course.find({ published: true })
              .sort({ order: 1, createdAt: -1 })
              .select('title slug shortDescription coverImage price currency noIndex updatedAt')
              .lean()
          : Promise.resolve([]),
      ]);
      const courseList = (publishedCourses as Array<Record<string, unknown>>).filter(
        (c) => c.noIndex !== true
      );
      const statsMap = ctx.dbReady
        ? await getCourseSeoStatsMap(courseList.map((c) => c._id))
        : new Map();
      applyPageSeoRecord(
        seoDoc,
        'NexaFlow Learn | Practical AI, Data & Engineering Courses',
        ctx.globalDescription
      );
      entitySummary = { totalPublishedCourses: courseList.length };
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url: canonicalUrl,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: courseList.length,
          itemListElement: courseList.map((c, idx) => {
            const cSlug = String(c.slug || '');
            const cUrl = `${ctx.baseUrl}/learn/${cSlug}`;
            const cStats = statsMap.get(String(c._id));
            return {
              '@type': 'ListItem',
              position: idx + 1,
              url: cUrl,
              item: buildCourseJsonLd({
                course: c,
                baseUrl: ctx.baseUrl,
                canonicalUrl: cUrl,
                siteName: ctx.siteName,
                description: cleanText(c.shortDescription, 300) || description,
                ogImage: resolveAbsoluteAssetUrl(
                  typeof c.coverImage === 'string' ? c.coverImage : '',
                  ctx.baseUrl,
                  '/og-image.png'
                ),
                stats: cStats,
              }),
            };
          }),
        },
      };
    } else if (targetPath.startsWith('/learn/')) {
      entityType = 'course';
      pageKey = 'learn';
      slug = normalizeSlug(targetPath.slice('/learn/'.length));
      const course =
        ctx.dbReady && slug
          ? ((await Course.findOne({ slug, published: true }).lean()) as Record<
              string,
              unknown
            > | null)
          : null;

      if (!course) {
        found = false;
        entityType = 'not_found';
        title = `Course Not Found | ${ctx.titleSuffix}`;
        description = 'The requested course could not be found in the NexaFlow Learn catalog.';
        noIndex = true;
      } else {
        const statsMap = await getCourseSeoStatsMap([course._id]);
        const stats = statsMap.get(String(course._id)) || {
          moduleCount: 0,
          lessonCount: 0,
          averageRating: 0,
          reviewCount: 0,
        };
        const courseTitle = cleanText(course.title, 180);
        title = cleanText(course.seoTitle, 200) || `${courseTitle} | NexaFlow Learn`;
        description =
          cleanText(course.seoDescription, 400) ||
          cleanText(course.shortDescription, 400) ||
          ctx.globalDescription;
        canonicalUrl = resolveEffectiveCanonical(
          typeof course.canonicalUrl === 'string' ? course.canonicalUrl : '',
          ctx.baseUrl,
          targetPath
        );
        ogImage =
          typeof course.ogImage === 'string' && course.ogImage.trim()
            ? resolveAbsoluteAssetUrl(course.ogImage, ctx.baseUrl, '/og-image.png')
            : typeof course.coverImage === 'string' && course.coverImage.trim()
              ? resolveAbsoluteAssetUrl(course.coverImage, ctx.baseUrl, '/og-image.png')
              : ctx.globalOgImage;
        keywords =
          normalizeKeywords(
            typeof course.focusKeyword === 'string' ? course.focusKeyword : '',
            ctx.globalKeywords
          ) || ctx.globalKeywords;
        noIndex = course.noIndex !== undefined ? Boolean(course.noIndex) : ctx.globalNoIndex;
        updatedAt = course.updatedAt ? new Date(course.updatedAt as string | Date).toISOString() : null;
        entitySummary = {
          id: String(course._id),
          title: courseTitle,
          slug: String(course.slug || slug),
          price: Number(course.price || 0),
          currency: cleanText(course.currency, 10) || 'GHS',
          ...stats,
        };
        structuredData = buildCourseJsonLd({
          course,
          baseUrl: ctx.baseUrl,
          canonicalUrl,
          siteName: ctx.siteName,
          description,
          ogImage,
          stats,
        });
      }
    } else if (targetPath === '/products') {
      entityType = 'product_catalog';
      pageKey = 'products';
      const [seoDoc, publishedProducts] = await Promise.all([
        lookupPageSeo('products'),
        ctx.dbReady
          ? Product.find({ published: true })
              .sort({ order: 1, createdAt: 1 })
              .select(
                'name slug category shortDescription images pricingStatus features noIndex updatedAt'
              )
              .lean()
          : Promise.resolve(DEFAULT_PRODUCTS),
      ]);
      const productList = (publishedProducts as Array<Record<string, unknown>>).filter(
        (p) => p.noIndex !== true
      );
      applyPageSeoRecord(seoDoc, `Products & Platforms | ${ctx.titleSuffix}`, ctx.globalDescription);
      entitySummary = { totalPublishedProducts: productList.length };
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url: canonicalUrl,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: productList.length,
          itemListElement: productList.map((p, idx) => {
            const pSlug = String(p.slug || '');
            const pUrl = `${ctx.baseUrl}/products/${pSlug}`;
            const images = Array.isArray(p.images) ? p.images : [];
            const firstImage = typeof images[0] === 'string' ? images[0] : '';
            return {
              '@type': 'ListItem',
              position: idx + 1,
              url: pUrl,
              item: buildProductJsonLd({
                product: p,
                canonicalUrl: pUrl,
                siteName: ctx.siteName,
                description: cleanText(p.shortDescription, 300) || description,
                ogImage: resolveAbsoluteAssetUrl(firstImage, ctx.baseUrl, '/og-image.png'),
              }),
            };
          }),
        },
      };
    } else if (targetPath.startsWith('/products/')) {
      entityType = 'product';
      pageKey = 'products';
      slug = normalizeSlug(targetPath.slice('/products/'.length));
      const product = slug
        ? ctx.dbReady
          ? ((await Product.findOne({ slug, published: true }).lean()) as Record<
              string,
              unknown
            > | null)
          : ((DEFAULT_PRODUCTS.find((p) => p.slug === slug) as Record<string, unknown> | undefined) ??
            null)
        : null;

      if (!product) {
        found = false;
        entityType = 'not_found';
        title = `Product Not Found | ${ctx.titleSuffix}`;
        description = 'The requested product could not be found in the NexaFlow catalog.';
        noIndex = true;
      } else {
        const productName = cleanText(product.name, 160);
        const images = Array.isArray(product.images) ? product.images : [];
        const firstImage = typeof images[0] === 'string' ? images[0] : '';
        title = cleanText(product.seoTitle, 200) || `${productName} | ${ctx.titleSuffix}`;
        description =
          cleanText(product.seoDescription, 400) ||
          cleanText(product.shortDescription, 400) ||
          ctx.globalDescription;
        canonicalUrl = resolveEffectiveCanonical(
          typeof product.canonicalUrl === 'string' ? product.canonicalUrl : '',
          ctx.baseUrl,
          targetPath
        );
        ogImage =
          typeof product.ogImage === 'string' && product.ogImage.trim()
            ? resolveAbsoluteAssetUrl(product.ogImage, ctx.baseUrl, '/og-image.png')
            : firstImage.trim()
              ? resolveAbsoluteAssetUrl(firstImage, ctx.baseUrl, '/og-image.png')
              : ctx.globalOgImage;
        keywords =
          normalizeKeywords(
            typeof product.focusKeyword === 'string' ? product.focusKeyword : '',
            typeof product.category === 'string' ? product.category : '',
            ctx.globalKeywords
          ) || ctx.globalKeywords;
        noIndex = product.noIndex !== undefined ? Boolean(product.noIndex) : ctx.globalNoIndex;
        updatedAt = product.updatedAt
          ? new Date(product.updatedAt as string | Date).toISOString()
          : null;
        entitySummary = {
          name: productName,
          slug: String(product.slug || slug),
          category: cleanText(product.category, 100),
          pricingStatus: cleanText(product.pricingStatus, 120),
        };
        structuredData = buildProductJsonLd({
          product,
          canonicalUrl,
          siteName: ctx.siteName,
          description,
          ogImage,
        });
      }
    } else if (targetPath === '/solutions') {
      entityType = 'service_catalog';
      pageKey = 'solutions';
      const [seoDoc, publishedServices] = await Promise.all([
        lookupPageSeo('solutions'),
        ctx.dbReady
          ? Service.find({ published: true })
              .sort({ order: 1, createdAt: 1 })
              .select('name slug shortDescription coverImage noIndex updatedAt')
              .lean()
          : Promise.resolve(DEFAULT_SERVICES),
      ]);
      const serviceList = (publishedServices as Array<Record<string, unknown>>).filter(
        (s) => s.noIndex !== true
      );
      applyPageSeoRecord(seoDoc, `Solutions & Services | ${ctx.titleSuffix}`, ctx.globalDescription);
      entitySummary = { totalPublishedServices: serviceList.length };
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url: canonicalUrl,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: serviceList.length,
          itemListElement: serviceList.map((s, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            url: `${ctx.baseUrl}/solutions/${String(s.slug || '')}`,
            item: {
              '@type': 'Service',
              name: cleanText(s.name, 160),
              description: cleanText(s.shortDescription, 300),
              provider: { '@type': 'Organization', name: ctx.siteName },
            },
          })),
        },
      };
    } else if (targetPath.startsWith('/solutions/')) {
      entityType = 'service';
      pageKey = 'solutions';
      slug = normalizeSlug(targetPath.slice('/solutions/'.length));
      const service = slug
        ? ctx.dbReady
          ? ((await Service.findOne({ slug, published: true }).lean()) as Record<
              string,
              unknown
            > | null)
          : ((DEFAULT_SERVICES.find((s) => s.slug === slug) as Record<string, unknown> | undefined) ??
            null)
        : null;

      if (!service) {
        found = false;
        entityType = 'not_found';
        title = `Solution Not Found | ${ctx.titleSuffix}`;
        description = 'The requested solution page could not be found.';
        noIndex = true;
      } else {
        const serviceName = cleanText(service.name, 160);
        title = cleanText(service.seoTitle, 200) || `${serviceName} | ${ctx.titleSuffix}`;
        description =
          cleanText(service.seoDescription, 400) ||
          cleanText(service.shortDescription, 400) ||
          ctx.globalDescription;
        canonicalUrl = resolveEffectiveCanonical(
          typeof service.canonicalUrl === 'string' ? service.canonicalUrl : '',
          ctx.baseUrl,
          targetPath
        );
        ogImage =
          typeof service.ogImage === 'string' && service.ogImage.trim()
            ? resolveAbsoluteAssetUrl(service.ogImage, ctx.baseUrl, '/og-image.png')
            : typeof service.coverImage === 'string' && service.coverImage.trim()
              ? resolveAbsoluteAssetUrl(service.coverImage, ctx.baseUrl, '/og-image.png')
              : ctx.globalOgImage;
        keywords =
          normalizeKeywords(
            typeof service.focusKeyword === 'string' ? service.focusKeyword : '',
            ctx.globalKeywords
          ) || ctx.globalKeywords;
        noIndex = service.noIndex !== undefined ? Boolean(service.noIndex) : ctx.globalNoIndex;
        updatedAt = service.updatedAt
          ? new Date(service.updatedAt as string | Date).toISOString()
          : null;
        entitySummary = { name: serviceName, slug: String(service.slug || slug) };
        structuredData = {
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: serviceName,
          serviceType: serviceName,
          description,
          url: canonicalUrl,
          image: ogImage,
          provider: {
            '@type': 'Organization',
            name: ctx.siteName,
            url: ctx.baseUrl,
          },
        };
      }
    } else if (targetPath === '/insights') {
      entityType = 'article_catalog';
      pageKey = 'insights';
      const [seoDoc, publishedArticles] = await Promise.all([
        lookupPageSeo('insights'),
        ctx.dbReady
          ? Article.find({ status: 'published' })
              .sort({ publishedAt: -1, createdAt: -1 })
              .limit(20)
              .select('title slug excerpt featuredImage authorName noIndex publishedAt updatedAt')
              .lean()
          : Promise.resolve([]),
      ]);
      const articleList = (publishedArticles as Array<Record<string, unknown>>).filter(
        (a) => a.noIndex !== true
      );
      applyPageSeoRecord(
        seoDoc,
        `Insights & Engineering Articles | ${ctx.titleSuffix}`,
        ctx.globalDescription
      );
      entitySummary = { totalPublishedArticles: articleList.length };
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url: canonicalUrl,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: articleList.length,
          itemListElement: articleList.map((a, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            url: `${ctx.baseUrl}/insights/${String(a.slug || '')}`,
            name: cleanText(a.title, 200),
          })),
        },
      };
    } else if (targetPath.startsWith('/insights/')) {
      entityType = 'article';
      pageKey = 'insights';
      ogType = 'article';
      slug = normalizeSlug(targetPath.slice('/insights/'.length));
      const article =
        ctx.dbReady && slug
          ? ((await Article.findOne({ slug, status: 'published' }).lean()) as Record<
              string,
              unknown
            > | null)
          : null;

      if (!article) {
        found = false;
        entityType = 'not_found';
        ogType = 'website';
        title = `Article Not Found | ${ctx.titleSuffix}`;
        description = 'The requested engineering article could not be found.';
        noIndex = true;
      } else {
        const articleTitle = cleanText(article.title, 200);
        const tags = Array.isArray(article.tags) ? article.tags.map(String) : [];
        title = cleanText(article.seoTitle, 200) || `${articleTitle} | NexaFlow Insights`;
        description =
          cleanText(article.seoDescription, 400) ||
          cleanText(article.excerpt, 400) ||
          ctx.globalDescription;
        canonicalUrl = resolveEffectiveCanonical(
          typeof article.canonicalUrl === 'string' ? article.canonicalUrl : '',
          ctx.baseUrl,
          targetPath
        );
        ogImage =
          typeof article.ogImage === 'string' && article.ogImage.trim()
            ? resolveAbsoluteAssetUrl(article.ogImage, ctx.baseUrl, '/og-image.png')
            : typeof article.featuredImage === 'string' && article.featuredImage.trim()
              ? resolveAbsoluteAssetUrl(article.featuredImage, ctx.baseUrl, '/og-image.png')
              : ctx.globalOgImage;
        keywords =
          normalizeKeywords(
            typeof article.focusKeyword === 'string' ? article.focusKeyword : '',
            tags
          ) || ctx.globalKeywords;
        noIndex = article.noIndex !== undefined ? Boolean(article.noIndex) : ctx.globalNoIndex;
        const publishedAtIso = article.publishedAt
          ? new Date(article.publishedAt as string | Date).toISOString()
          : undefined;
        updatedAt = article.updatedAt
          ? new Date(article.updatedAt as string | Date).toISOString()
          : publishedAtIso || null;
        entitySummary = {
          title: articleTitle,
          slug: String(article.slug || slug),
          category: cleanText(article.category, 80),
          authorName: cleanText(article.authorName, 120),
          publishedAt: publishedAtIso || null,
        };
        structuredData = {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: articleTitle,
          description,
          image: ogImage,
          url: canonicalUrl,
          ...(publishedAtIso ? { datePublished: publishedAtIso } : {}),
          ...(updatedAt ? { dateModified: updatedAt } : {}),
          author: {
            '@type': 'Person',
            name: cleanText(article.authorName, 120) || 'NexaFlow Editorial',
          },
          publisher: {
            '@type': 'Organization',
            name: ctx.siteName,
            logo: {
              '@type': 'ImageObject',
              url: resolveAbsoluteAssetUrl('/favicon.svg', ctx.baseUrl, '/favicon.svg'),
            },
          },
        };
      }
    } else if (targetPath.startsWith('/legal/')) {
      const legalType = normalizeSlug(targetPath.slice('/legal/'.length));
      const label = LEGAL_PAGE_LABELS[legalType];
      if (!label) {
        found = false;
        entityType = 'not_found';
        title = `Page Not Found | ${ctx.titleSuffix}`;
        description = `The requested page on ${ctx.siteName} could not be found.`;
        noIndex = true;
      } else {
        entityType = 'legal';
        pageKey = `legal/${legalType}`;
        const seoDoc = await lookupPageSeo(pageKey);
        applyPageSeoRecord(
          seoDoc,
          `${label} | ${ctx.titleSuffix}`,
          `Review the official ${label} for ${ctx.siteName} and NexaFlow Learn.`
        );
        structuredData = {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          description,
          url: canonicalUrl,
        };
      }
    } else {
      const staticKey = targetPath.replace(/^\//, '');
      const staticConfig = STATIC_PAGE_DEFAULTS[staticKey];
      if (!staticConfig) {
        found = false;
        entityType = 'not_found';
        title = `Page Not Found | ${ctx.titleSuffix}`;
        description = `The requested page on ${ctx.siteName} could not be found.`;
        noIndex = true;
      } else {
        entityType = 'page';
        pageKey = staticKey;
        const seoDoc = await lookupPageSeo(staticKey);
        const fallbackTitle =
          staticKey === 'about'
            ? `About ${ctx.siteName} | ${ctx.titleSuffix}`
            : `${staticConfig.titleSuffixLabel} | ${ctx.titleSuffix}`;
        applyPageSeoRecord(seoDoc, fallbackTitle, ctx.globalDescription);
        structuredData = {
          '@context': 'https://schema.org',
          '@type': staticConfig.schemaType || 'WebPage',
          name: title,
          description,
          url: canonicalUrl,
        };
      }
    }

    const finalOgTitle = ogTitle || title;
    const finalOgDescription = ogDescription || description;
    const robots = noIndex ? 'noindex, nofollow' : 'index, follow';
    const finalStructuredData =
      ctx.structuredDataEnabled && !noIndex ? structuredData : null;

    if (!found || entityType === 'private' || noIndex) {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    }

    return res.status(found ? 200 : 404).json({
      ok: true,
      found,
      dbConnected: ctx.dbReady,
      entityType,
      path: targetPath,
      pageKey,
      slug,
      updatedAt,
      meta: {
        title,
        description,
        canonicalUrl,
        ogTitle: finalOgTitle,
        ogDescription: finalOgDescription,
        ogImage,
        ogType,
        twitterCard: ctx.twitterCard,
        twitterSite: ctx.twitterSite,
        siteName: ctx.siteName,
        keywords,
        noIndex,
        robots,
        gscVerificationTag: ctx.gscVerificationTag,
        structuredData: finalStructuredData,
      },
      ...(entitySummary ? { entity: entitySummary } : {}),
    });
  } catch (err) {
    console.error('[SEO] Failed to resolve dynamic metadata:', err);
    return res.status(500).json({ error: 'Unable to resolve SEO metadata.' });
  }
});

/**
 * GET /api/seo/catalog-index
 * Returns a consolidated, search-indexable directory of all published LMS courses,
 * products, services, articles, and CMS pages with resolved SEO metadata.
 */
router.get('/api/seo/catalog-index', async (req, res) => {
  try {
    const filterType = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : '';
    const allowedFilters = new Set(['', 'courses', 'products', 'services', 'articles', 'pages']);
    if (!allowedFilters.has(filterType)) {
      return res.status(400).json({
        error: 'Invalid catalog filter. Allowed values: courses, products, services, articles, pages.',
      });
    }

    const ctx = await resolveSiteContext(req);

    let dbSeoPages: Array<Record<string, unknown>> = [];
    let dbCourses: Array<Record<string, unknown>> = [];
    let dbProducts: Array<Record<string, unknown>> = DEFAULT_PRODUCTS;
    let dbServices: Array<Record<string, unknown>> = DEFAULT_SERVICES;
    let dbArticles: Array<Record<string, unknown>> = [];

    if (ctx.dbReady) {
      const [seoRows, courseRows, productRows, serviceRows, articleRows] = await Promise.all([
        SEOSettings.find().lean(),
        Course.find({ published: true }).sort({ order: 1, createdAt: -1 }).lean(),
        Product.find({ published: true }).sort({ order: 1, createdAt: 1 }).lean(),
        Service.find({ published: true }).sort({ order: 1, createdAt: 1 }).lean(),
        Article.find({ status: 'published' }).sort({ publishedAt: -1, createdAt: -1 }).lean(),
      ]);
      dbSeoPages = seoRows as Array<Record<string, unknown>>;
      dbCourses = (courseRows as Array<Record<string, unknown>>).filter((c) => c.noIndex !== true);
      dbProducts = (productRows as Array<Record<string, unknown>>).filter((p) => p.noIndex !== true);
      dbServices = (serviceRows as Array<Record<string, unknown>>).filter((s) => s.noIndex !== true);
      dbArticles = (articleRows as Array<Record<string, unknown>>).filter((a) => a.noIndex !== true);
    }

    const courseStatsMap = ctx.dbReady
      ? await getCourseSeoStatsMap(dbCourses.map((c) => c._id))
      : new Map();

    const seoByKey = new Map<string, Record<string, unknown>>();
    for (const def of DEFAULT_SEO_PAGES) {
      seoByKey.set(def.pageKey, def as Record<string, unknown>);
    }
    for (const row of dbSeoPages) {
      const key = String(row.pageKey || '');
      if (row.noIndex === true) {
        seoByKey.delete(key);
      } else {
        seoByKey.set(key, row);
      }
    }

    const pages = Array.from(seoByKey.entries()).map(([key, row]) => {
      const path = key === 'home' ? '/' : `/${key}`;
      return {
        pageKey: key,
        path,
        canonicalUrl: resolveEffectiveCanonical(
          typeof row.canonicalUrl === 'string' ? row.canonicalUrl : '',
          ctx.baseUrl,
          path
        ),
        title: cleanText(row.title, 200) || ctx.globalTitle,
        description: cleanText(row.description, 400) || ctx.globalDescription,
        ogImage: resolveAbsoluteAssetUrl(
          typeof row.ogImage === 'string' ? row.ogImage : '',
          ctx.baseUrl,
          '/og-image.png'
        ),
        keywords: normalizeKeywords(typeof row.focusKeyword === 'string' ? row.focusKeyword : ''),
        noIndex: Boolean(row.noIndex),
        updatedAt: row.updatedAt ? new Date(row.updatedAt as string | Date).toISOString() : null,
      };
    });

    const courses = dbCourses.map((c) => {
      const cSlug = String(c.slug || '');
      const path = `/learn/${cSlug}`;
      const stats = courseStatsMap.get(String(c._id)) || {
        moduleCount: 0,
        lessonCount: 0,
        averageRating: 0,
        reviewCount: 0,
      };
      return {
        id: String(c._id),
        slug: cSlug,
        path,
        canonicalUrl: resolveEffectiveCanonical(
          typeof c.canonicalUrl === 'string' ? c.canonicalUrl : '',
          ctx.baseUrl,
          path
        ),
        title: cleanText(c.seoTitle, 200) || `${cleanText(c.title, 180)} | NexaFlow Learn`,
        description:
          cleanText(c.seoDescription, 400) ||
          cleanText(c.shortDescription, 400) ||
          ctx.globalDescription,
        ogImage: resolveAbsoluteAssetUrl(
          typeof c.ogImage === 'string' && c.ogImage.trim()
            ? c.ogImage
            : typeof c.coverImage === 'string'
              ? c.coverImage
              : '',
          ctx.baseUrl,
          '/og-image.png'
        ),
        keywords: normalizeKeywords(typeof c.focusKeyword === 'string' ? c.focusKeyword : ''),
        price: Number(c.price || 0),
        currency: cleanText(c.currency, 10) || 'GHS',
        ...stats,
        updatedAt: c.updatedAt ? new Date(c.updatedAt as string | Date).toISOString() : null,
      };
    });

    const products = dbProducts.map((p) => {
      const pSlug = String(p.slug || '');
      const path = `/products/${pSlug}`;
      const images = Array.isArray(p.images) ? p.images : [];
      const firstImage = typeof images[0] === 'string' ? images[0] : '';
      return {
        slug: pSlug,
        path,
        canonicalUrl: resolveEffectiveCanonical(
          typeof p.canonicalUrl === 'string' ? p.canonicalUrl : '',
          ctx.baseUrl,
          path
        ),
        title: cleanText(p.seoTitle, 200) || `${cleanText(p.name, 160)} | ${ctx.titleSuffix}`,
        description:
          cleanText(p.seoDescription, 400) ||
          cleanText(p.shortDescription, 400) ||
          ctx.globalDescription,
        ogImage: resolveAbsoluteAssetUrl(
          typeof p.ogImage === 'string' && p.ogImage.trim() ? p.ogImage : firstImage,
          ctx.baseUrl,
          '/og-image.png'
        ),
        keywords: normalizeKeywords(
          typeof p.focusKeyword === 'string' ? p.focusKeyword : '',
          typeof p.category === 'string' ? p.category : ''
        ),
        category: cleanText(p.category, 100),
        pricingStatus: cleanText(p.pricingStatus, 120),
        updatedAt: p.updatedAt ? new Date(p.updatedAt as string | Date).toISOString() : null,
      };
    });

    const services = dbServices.map((s) => {
      const sSlug = String(s.slug || '');
      const path = `/solutions/${sSlug}`;
      return {
        slug: sSlug,
        path,
        canonicalUrl: resolveEffectiveCanonical(
          typeof s.canonicalUrl === 'string' ? s.canonicalUrl : '',
          ctx.baseUrl,
          path
        ),
        title: cleanText(s.seoTitle, 200) || `${cleanText(s.name, 160)} | ${ctx.titleSuffix}`,
        description:
          cleanText(s.seoDescription, 400) ||
          cleanText(s.shortDescription, 400) ||
          ctx.globalDescription,
        ogImage: resolveAbsoluteAssetUrl(
          typeof s.ogImage === 'string' && s.ogImage.trim()
            ? s.ogImage
            : typeof s.coverImage === 'string'
              ? s.coverImage
              : '',
          ctx.baseUrl,
          '/og-image.png'
        ),
        keywords: normalizeKeywords(typeof s.focusKeyword === 'string' ? s.focusKeyword : ''),
        updatedAt: s.updatedAt ? new Date(s.updatedAt as string | Date).toISOString() : null,
      };
    });

    const articles = dbArticles.map((a) => {
      const aSlug = String(a.slug || '');
      const path = `/insights/${aSlug}`;
      const tags = Array.isArray(a.tags) ? a.tags.map(String) : [];
      return {
        slug: aSlug,
        path,
        canonicalUrl: resolveEffectiveCanonical(
          typeof a.canonicalUrl === 'string' ? a.canonicalUrl : '',
          ctx.baseUrl,
          path
        ),
        title: cleanText(a.seoTitle, 200) || `${cleanText(a.title, 200)} | NexaFlow Insights`,
        description:
          cleanText(a.seoDescription, 400) ||
          cleanText(a.excerpt, 400) ||
          ctx.globalDescription,
        ogImage: resolveAbsoluteAssetUrl(
          typeof a.ogImage === 'string' && a.ogImage.trim()
            ? a.ogImage
            : typeof a.featuredImage === 'string'
              ? a.featuredImage
              : '',
          ctx.baseUrl,
          '/og-image.png'
        ),
        keywords: normalizeKeywords(
          typeof a.focusKeyword === 'string' ? a.focusKeyword : '',
          tags
        ),
        category: cleanText(a.category, 80),
        publishedAt: a.publishedAt ? new Date(a.publishedAt as string | Date).toISOString() : null,
        updatedAt: a.updatedAt ? new Date(a.updatedAt as string | Date).toISOString() : null,
      };
    });

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

    return res.json({
      ok: true,
      dbConnected: ctx.dbReady,
      generatedAt: new Date().toISOString(),
      baseUrl: ctx.baseUrl,
      counts: {
        pages: pages.length,
        courses: courses.length,
        products: products.length,
        services: services.length,
        articles: articles.length,
      },
      ...(!filterType || filterType === 'pages' ? { pages } : {}),
      ...(!filterType || filterType === 'courses' ? { courses } : {}),
      ...(!filterType || filterType === 'products' ? { products } : {}),
      ...(!filterType || filterType === 'services' ? { services } : {}),
      ...(!filterType || filterType === 'articles' ? { articles } : {}),
    });
  } catch (err) {
    console.error('[SEO] Failed to build catalog index:', err);
    return res.status(500).json({ error: 'Unable to build SEO catalog index.' });
  }
});

export default router;
