import fs from 'node:fs';
import { Request, Response } from 'express';
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
import {
  buildImageProxyPath,
  needsServerImageResolution,
  normalizeImageUrl,
} from '../shared/media.js';

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

const htmlTemplateCache = new Map<string, string>();

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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonLdStringify(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
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
  const raw = value?.trim() || '';
  if (!raw) return `${baseUrl}${fallbackPath}`;
  const normalized = normalizeImageUrl(raw) || raw;
  if (needsServerImageResolution(normalized)) {
    return `${baseUrl}${buildImageProxyPath(normalized)}`;
  }
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `${baseUrl}${normalized.startsWith('/') ? '' : '/'}${normalized}`;
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

function buildBreadcrumbJsonLd(
  baseUrl: string,
  items: Array<{ name: string; path: string }>
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: cleanText(item.name, 140),
      item: item.path.startsWith('http') ? item.path : `${baseUrl}${item.path}`,
    })),
  };
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

export function buildCourseJsonLd(params: {
  course: Record<string, unknown>;
  baseUrl: string;
  canonicalUrl: string;
  siteName: string;
  description: string;
  ogImage: string;
  stats?: { moduleCount: number; lessonCount: number; averageRating: number; reviewCount: number };
  reviews?: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  const { course, baseUrl, canonicalUrl, siteName, description, ogImage, stats, reviews } = params;
  const ratingsEnabled = course.ratingsEnabled !== false;
  const title = cleanText(course.title, 180);
  const price = Number(course.price || 0);
  const currency = cleanText(course.currency, 10).toUpperCase() || 'GHS';
  const teaches = Array.isArray(course.outcomes) && course.outcomes.length > 0
    ? course.outcomes.map((o) => cleanText(o, 180)).filter(Boolean)
    : Array.isArray(course.objectives)
      ? course.objectives.map((o) => cleanText(o, 180)).filter(Boolean)
      : [];

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: title,
    description,
    url: canonicalUrl,
    image: ogImage,
    inLanguage: 'en',
    provider: {
      '@type': 'Organization',
      name: siteName,
      url: baseUrl,
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

  if (teaches.length > 0) {
    schema.teaches = teaches.slice(0, 8);
  }

  if (stats && stats.lessonCount > 0) {
    schema.numberOfCredits = stats.moduleCount;
    schema.hasCourseInstance = {
      '@type': 'CourseInstance',
      courseMode: 'online',
      courseWorkload: `${stats.moduleCount} modules · ${stats.lessonCount} lessons`,
    };
  }

  if (ratingsEnabled && stats && stats.reviewCount > 0 && stats.averageRating > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: stats.averageRating,
      reviewCount: stats.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  if (ratingsEnabled && reviews && reviews.length > 0) {
    schema.review = reviews.slice(0, 5).map((r) => ({
      '@type': 'Review',
      author: {
        '@type': 'Person',
        name: cleanText(r.authorName, 100) || 'Verified Learner',
      },
      reviewRating: {
        '@type': 'Rating',
        ratingValue: Number(r.rating || 5),
        bestRating: 5,
        worstRating: 1,
      },
      ...(cleanText(r.title, 160) ? { name: cleanText(r.title, 160) } : {}),
      ...(cleanText(r.comment, 500) ? { reviewBody: cleanText(r.comment, 500) } : {}),
    }));
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

export async function resolveSeoMetadataForPath(
  req: Request,
  rawPath: unknown,
  options?: { type?: string; slug?: string; pageKey?: string }
) {
  const rawType = options?.type ? options.type.trim().toLowerCase() : '';
  const explicitSlug = normalizeSlug(options?.slug);
  const explicitPageKey = normalizeSlug(options?.pageKey);

  let targetPath = normalizeSeoPath(rawPath);
  if ((!rawPath || rawPath === '') && rawType) {
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
  let heading = ctx.siteName;
  const crawlerLinks: Array<{ href: string; label: string }> = [
    { href: '/solutions', label: 'Solutions & Services' },
    { href: '/products', label: 'Products & Platforms' },
    { href: '/learn', label: 'NexaFlow Learn Courses' },
    { href: '/insights', label: 'Insights & Resources' },
    { href: '/about', label: 'About NexaFlow' },
    { href: '/contact', label: 'Contact & Consultation' },
  ];

  let title = ctx.globalTitle;
  let description = ctx.globalDescription;
  let canonicalUrl = `${ctx.baseUrl}${targetPath}`;
  let ogTitle = '';
  let ogDescription = '';
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
    ogTitle = cleanText(seoDoc?.ogTitle, 200) || title;
    ogDescription = cleanText(seoDoc?.ogDescription, 400) || description;
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
      heading = 'Administrator Portal';
    } else if (targetPath.startsWith('/learner')) {
      title = 'Learner Portal | NexaFlow Learn';
      description = 'Access your enrolled courses, lesson progress, and support tickets.';
      heading = 'Learner Portal';
    } else {
      title = 'Account Access | NexaFlow Learn';
      description = 'Sign in, create a learner account, or reset your NexaFlow Learn password.';
      heading = 'Account Access';
    }
  } else if (targetPath === '/') {
    entityType = 'home';
    pageKey = 'home';
    const seoDoc = await lookupPageSeo('home');
    applyPageSeoRecord(seoDoc, ctx.globalTitle, ctx.globalDescription);
    ogTitle = cleanText(seoDoc?.ogTitle, 200) || title;
    ogDescription = cleanText(seoDoc?.ogDescription, 400) || description;
    heading = `${ctx.siteName} — AI, Data & Digital Solutions`;
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
    heading = 'Structured Courses for Practitioners & Teams';
    const [seoDoc, publishedCourses] = await Promise.all([
      lookupPageSeo('learn'),
      ctx.dbReady
        ? Course.find({ published: true })
            .sort({ order: 1, createdAt: -1 })
            .select(
              'title slug shortDescription coverImage price currency noIndex ratingsEnabled objectives outcomes updatedAt'
            )
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
    for (const c of courseList) {
      crawlerLinks.push({
        href: `/learn/${String(c.slug || '')}`,
        label: cleanText(c.title, 140),
      });
    }
    structuredData = [
      {
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
      },
      buildBreadcrumbJsonLd(ctx.baseUrl, [
        { name: 'Home', path: '/' },
        { name: 'Learn', path: '/learn' },
      ]),
    ];
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
      heading = 'Course Not Found';
      description = 'The requested course could not be found in the NexaFlow Learn catalog.';
      noIndex = true;
    } else {
      const ratingsEnabled = course.ratingsEnabled !== false;
      const [statsMap, publishedReviews] = await Promise.all([
        getCourseSeoStatsMap([course._id]),
        ratingsEnabled
          ? CourseReview.find({ courseId: course._id, status: 'published' })
              .sort({ createdAt: -1 })
              .limit(5)
              .select('authorName rating title comment createdAt')
              .lean()
          : Promise.resolve([]),
      ]);
      const rawStats = statsMap.get(String(course._id)) || {
        moduleCount: 0,
        lessonCount: 0,
        averageRating: 0,
        reviewCount: 0,
      };
      const stats = ratingsEnabled
        ? rawStats
        : { ...rawStats, averageRating: 0, reviewCount: 0 };
      const courseTitle = cleanText(course.title, 180);
      heading = courseTitle;
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
        ratingsEnabled,
        ...stats,
      };
      structuredData = [
        buildCourseJsonLd({
          course,
          baseUrl: ctx.baseUrl,
          canonicalUrl,
          siteName: ctx.siteName,
          description,
          ogImage,
          stats,
          reviews: publishedReviews as Array<Record<string, unknown>>,
        }),
        buildBreadcrumbJsonLd(ctx.baseUrl, [
          { name: 'Home', path: '/' },
          { name: 'Learn', path: '/learn' },
          { name: courseTitle, path: `/learn/${String(course.slug || slug)}` },
        ]),
      ];
    }
  } else if (targetPath === '/products') {
    entityType = 'product_catalog';
    pageKey = 'products';
    heading = 'NexaFlow Products & Platforms';
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
    for (const p of productList) {
      crawlerLinks.push({
        href: `/products/${String(p.slug || '')}`,
        label: cleanText(p.name, 140),
      });
    }
    structuredData = [
      {
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
      },
      buildBreadcrumbJsonLd(ctx.baseUrl, [
        { name: 'Home', path: '/' },
        { name: 'Products', path: '/products' },
      ]),
    ];
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
      heading = 'Product Not Found';
      description = 'The requested product could not be found in the NexaFlow catalog.';
      noIndex = true;
    } else {
      const productName = cleanText(product.name, 160);
      heading = productName;
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
      structuredData = [
        buildProductJsonLd({
          product,
          canonicalUrl,
          siteName: ctx.siteName,
          description,
          ogImage,
        }),
        buildBreadcrumbJsonLd(ctx.baseUrl, [
          { name: 'Home', path: '/' },
          { name: 'Products', path: '/products' },
          { name: productName, path: `/products/${String(product.slug || slug)}` },
        ]),
      ];
    }
  } else if (targetPath === '/solutions') {
    entityType = 'service_catalog';
    pageKey = 'solutions';
    heading = 'Engineering & Analytics Solutions';
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
    for (const s of serviceList) {
      crawlerLinks.push({
        href: `/solutions/${String(s.slug || '')}`,
        label: cleanText(s.name, 140),
      });
    }
    structuredData = [
      {
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
      },
      buildBreadcrumbJsonLd(ctx.baseUrl, [
        { name: 'Home', path: '/' },
        { name: 'Solutions', path: '/solutions' },
      ]),
    ];
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
      heading = 'Solution Not Found';
      description = 'The requested solution page could not be found.';
      noIndex = true;
    } else {
      const serviceName = cleanText(service.name, 160);
      heading = serviceName;
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
      structuredData = [
        {
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
        },
        buildBreadcrumbJsonLd(ctx.baseUrl, [
          { name: 'Home', path: '/' },
          { name: 'Solutions', path: '/solutions' },
          { name: serviceName, path: `/solutions/${String(service.slug || slug)}` },
        ]),
      ];
    }
  } else if (targetPath === '/insights') {
    entityType = 'article_catalog';
    pageKey = 'insights';
    heading = 'Insights & Technical Resources';
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
    for (const a of articleList) {
      crawlerLinks.push({
        href: `/insights/${String(a.slug || '')}`,
        label: cleanText(a.title, 140),
      });
    }
    structuredData = [
      {
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
      },
      buildBreadcrumbJsonLd(ctx.baseUrl, [
        { name: 'Home', path: '/' },
        { name: 'Insights', path: '/insights' },
      ]),
    ];
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
      heading = 'Article Not Found';
      description = 'The requested engineering article could not be found.';
      noIndex = true;
    } else {
      const articleTitle = cleanText(article.title, 200);
      heading = articleTitle;
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
      structuredData = [
        {
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
        },
        buildBreadcrumbJsonLd(ctx.baseUrl, [
          { name: 'Home', path: '/' },
          { name: 'Insights', path: '/insights' },
          { name: articleTitle, path: `/insights/${String(article.slug || slug)}` },
        ]),
      ];
    }
  } else if (targetPath.startsWith('/legal/')) {
    const legalType = normalizeSlug(targetPath.slice('/legal/'.length));
    const label = LEGAL_PAGE_LABELS[legalType];
    if (!label) {
      found = false;
      entityType = 'not_found';
      title = `Page Not Found | ${ctx.titleSuffix}`;
      heading = 'Page Not Found';
      description = `The requested page on ${ctx.siteName} could not be found.`;
      noIndex = true;
    } else {
      entityType = 'legal';
      pageKey = `legal/${legalType}`;
      heading = label;
      const seoDoc = await lookupPageSeo(pageKey);
      applyPageSeoRecord(
        seoDoc,
        `${label} | ${ctx.titleSuffix}`,
        `Review the official ${label} for ${ctx.siteName} and NexaFlow Learn.`
      );
      structuredData = [
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          description,
          url: canonicalUrl,
        },
        buildBreadcrumbJsonLd(ctx.baseUrl, [
          { name: 'Home', path: '/' },
          { name: label, path: `/legal/${legalType}` },
        ]),
      ];
    }
  } else {
    const staticKey = targetPath.replace(/^\//, '');
    const staticConfig = STATIC_PAGE_DEFAULTS[staticKey];
    if (!staticConfig) {
      found = false;
      entityType = 'not_found';
      title = `Page Not Found | ${ctx.titleSuffix}`;
      heading = 'Page Not Found';
      description = `The requested page on ${ctx.siteName} could not be found.`;
      noIndex = true;
    } else {
      entityType = 'page';
      pageKey = staticKey;
      heading = staticConfig.titleSuffixLabel;
      const seoDoc = await lookupPageSeo(staticKey);
      const fallbackTitle =
        staticKey === 'about'
          ? `About ${ctx.siteName} | ${ctx.titleSuffix}`
          : `${staticConfig.titleSuffixLabel} | ${ctx.titleSuffix}`;
      applyPageSeoRecord(seoDoc, fallbackTitle, ctx.globalDescription);
      structuredData = [
        {
          '@context': 'https://schema.org',
          '@type': staticConfig.schemaType || 'WebPage',
          name: title,
          description,
          url: canonicalUrl,
        },
        buildBreadcrumbJsonLd(ctx.baseUrl, [
          { name: 'Home', path: '/' },
          { name: staticConfig.titleSuffixLabel, path: targetPath },
        ]),
      ];
    }
  }

  const finalOgTitle = ogTitle || title;
  const finalOgDescription = ogDescription || description;
  const robots = noIndex
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  const finalStructuredData =
    ctx.structuredDataEnabled && !noIndex ? structuredData : null;

  return {
    found,
    entityType,
    path: targetPath,
    pageKey,
    slug,
    updatedAt,
    heading,
    crawlerLinks: Array.from(new Map(crawlerLinks.map((l) => [l.href, l])).values()),
    ctx,
    entitySummary,
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
  };
}

function upsertHeadMetaTag(
  html: string,
  attr: 'name' | 'property',
  key: string,
  content: string
): string {
  const escaped = escapeHtml(content);
  const pattern = new RegExp(
    `<meta\\b[^>]*\\b${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*\\/?>`,
    'i'
  );
  const tag = `<meta ${attr}="${key}" content="${escaped}" />`;
  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function upsertHeadLinkTag(html: string, rel: string, href: string): string {
  const escaped = escapeHtml(href);
  const pattern = new RegExp(
    `<link\\b[^>]*\\brel=["']${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*\\/?>`,
    'i'
  );
  const tag = `<link rel="${rel}" href="${escaped}" />`;
  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function buildSsrRootMarkup(params: {
  heading: string;
  description: string;
  ogImage: string;
  siteName: string;
  crawlerLinks: Array<{ href: string; label: string }>;
  noIndex: boolean;
}): string {
  const { heading, description, ogImage, siteName, crawlerLinks, noIndex } = params;
  if (noIndex) {
    return `<main data-ssr-seo="true"><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(description)}</p></main>`;
  }
  const navLinksHtml = crawlerLinks
    .slice(0, 24)
    .map(
      (link) =>
        `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`
    )
    .join('');

  return `<main data-ssr-seo="true" style="max-width:960px;margin:0 auto;padding:48px 20px;font-family:system-ui,sans-serif;">
      <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#00D4FF;">${escapeHtml(siteName)}</p>
      <h1 style="font-size:32px;line-height:1.2;margin:12px 0;">${escapeHtml(heading)}</h1>
      <p style="font-size:16px;line-height:1.6;max-width:680px;">${escapeHtml(description)}</p>
      ${ogImage ? `<img src="${escapeHtml(ogImage)}" alt="${escapeHtml(heading)}" style="max-width:100%;height:auto;margin-top:20px;border-radius:12px;" />` : ''}
      <nav aria-label="Explore ${escapeHtml(siteName)}" style="margin-top:28px;">
        <ul style="display:flex;flex-wrap:wrap;gap:14px;list-style:none;padding:0;">${navLinksHtml}</ul>
      </nav>
    </main>`;
}

export async function renderSeoInjectedHtml(
  req: Request,
  res: Response,
  distHtmlPath?: string
): Promise<void> {
  try {
    const resolved = await resolveSeoMetadataForPath(req, req.path || '/');
    const { meta, found, entityType, heading, crawlerLinks } = resolved;

    if (!found || entityType === 'private' || meta.noIndex) {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    }

    let template = '';
    if (distHtmlPath) {
      template = htmlTemplateCache.get(distHtmlPath) || '';
      if (!template && fs.existsSync(distHtmlPath)) {
        template = fs.readFileSync(distHtmlPath, 'utf8');
        htmlTemplateCache.set(distHtmlPath, template);
      }
    }

    const ssrMarkup = buildSsrRootMarkup({
      heading,
      description: meta.description,
      ogImage: meta.ogImage,
      siteName: meta.siteName,
      crawlerLinks,
      noIndex: meta.noIndex,
    });

    if (!template) {
      const jsonLdBlock = meta.structuredData
        ? `<script id="nf-jsonld" type="application/ld+json">${safeJsonLdStringify(meta.structuredData)}</script>`
        : '';
      const fallbackHtml = `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    <meta name="robots" content="${escapeHtml(meta.robots)}" />
    ${meta.keywords ? `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />` : ''}
    ${meta.gscVerificationTag ? `<meta name="google-site-verification" content="${escapeHtml(meta.gscVerificationTag)}" />` : ''}
    <link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}" />
    <link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml" />
    <meta property="og:type" content="${escapeHtml(meta.ogType)}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:site_name" content="${escapeHtml(meta.siteName)}" />
    <meta property="og:title" content="${escapeHtml(meta.ogTitle)}" />
    <meta property="og:description" content="${escapeHtml(meta.ogDescription)}" />
    <meta property="og:url" content="${escapeHtml(meta.canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtml(meta.ogImage)}" />
    <meta property="og:image:alt" content="${escapeHtml(meta.ogTitle)}" />
    <meta name="twitter:card" content="${escapeHtml(meta.twitterCard)}" />
    <meta name="twitter:title" content="${escapeHtml(meta.ogTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.ogDescription)}" />
    <meta name="twitter:image" content="${escapeHtml(meta.ogImage)}" />
    ${meta.twitterSite ? `<meta name="twitter:site" content="${escapeHtml(meta.twitterSite.startsWith('@') ? meta.twitterSite : `@${meta.twitterSite}`)}" />` : ''}
    ${jsonLdBlock}
  </head>
  <body style="background:#03051B;color:#F7F8FF;">
    <div id="root">${ssrMarkup}</div>
  </body>
</html>`;
      res.status(found ? 200 : 404).type('text/html').send(fallbackHtml);
      return;
    }

    let html = template.replace(
      /<title>[\s\S]*?<\/title>/i,
      `<title>${escapeHtml(meta.title)}</title>`
    );
    html = upsertHeadMetaTag(html, 'name', 'description', meta.description);
    html = upsertHeadMetaTag(html, 'name', 'robots', meta.robots);
    if (meta.keywords) {
      html = upsertHeadMetaTag(html, 'name', 'keywords', meta.keywords);
    }
    if (meta.gscVerificationTag) {
      html = upsertHeadMetaTag(html, 'name', 'google-site-verification', meta.gscVerificationTag);
    }
    html = upsertHeadLinkTag(html, 'canonical', meta.canonicalUrl);
    html = upsertHeadMetaTag(html, 'property', 'og:type', meta.ogType);
    html = upsertHeadMetaTag(html, 'property', 'og:site_name', meta.siteName);
    html = upsertHeadMetaTag(html, 'property', 'og:title', meta.ogTitle);
    html = upsertHeadMetaTag(html, 'property', 'og:description', meta.ogDescription);
    html = upsertHeadMetaTag(html, 'property', 'og:url', meta.canonicalUrl);
    html = upsertHeadMetaTag(html, 'property', 'og:image', meta.ogImage);
    html = upsertHeadMetaTag(html, 'property', 'og:image:alt', meta.ogTitle);
    html = upsertHeadMetaTag(html, 'name', 'twitter:card', meta.twitterCard);
    html = upsertHeadMetaTag(html, 'name', 'twitter:title', meta.ogTitle);
    html = upsertHeadMetaTag(html, 'name', 'twitter:description', meta.ogDescription);
    html = upsertHeadMetaTag(html, 'name', 'twitter:image', meta.ogImage);
    if (meta.twitterSite) {
      const handle = meta.twitterSite.startsWith('@') ? meta.twitterSite : `@${meta.twitterSite}`;
      html = upsertHeadMetaTag(html, 'name', 'twitter:site', handle);
    }

    const jsonLdTag = meta.structuredData
      ? `<script id="nf-jsonld" type="application/ld+json">${safeJsonLdStringify(meta.structuredData)}</script>`
      : '';
    if (/<script\b[^>]*id=["']nf-jsonld["'][^>]*>[\s\S]*?<\/script>/i.test(html)) {
      html = html.replace(
        /<script\b[^>]*id=["']nf-jsonld["'][^>]*>[\s\S]*?<\/script>/i,
        jsonLdTag
      );
    } else if (jsonLdTag) {
      html = html.replace(/<\/head>/i, `    ${jsonLdTag}\n  </head>`);
    }

    html = html.replace(
      /<div id="root"><\/div>/i,
      `<div id="root">${ssrMarkup}</div>`
    );

    res.status(found ? 200 : 404).type('text/html').send(html);
  } catch (err) {
    console.error('[SEO] Failed to render SEO-injected HTML:', err);
    if (distHtmlPath && fs.existsSync(distHtmlPath)) {
      res.sendFile(distHtmlPath);
      return;
    }
    res.status(500).type('text/html').send('<!doctype html><html><body><h1>NexaFlow Technologies</h1></body></html>');
  }
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
  res.setHeader('Cache-Control', 'public, max-age=3600');
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

  interface SitemapUrlEntry {
    loc: string;
    lastmod?: string;
    changefreq: 'daily' | 'weekly' | 'monthly';
    priority: string;
    image?: { loc: string; title?: string };
  }

  const urls: SitemapUrlEntry[] = [];

  let noIndexKeys = new Set<string>();
  let services: Array<{
    name?: string;
    slug: string;
    coverImage?: string;
    updatedAt?: Date;
    noIndex?: boolean;
  }> = DEFAULT_SERVICES;
  let products: Array<{
    name?: string;
    slug: string;
    images?: string[];
    updatedAt?: Date;
    noIndex?: boolean;
  }> = DEFAULT_PRODUCTS;
  let courses: Array<{
    title?: string;
    slug: string;
    coverImage?: string;
    updatedAt?: Date;
    noIndex?: boolean;
  }> = [];
  let articles: Array<{
    title?: string;
    slug: string;
    featuredImage?: string;
    updatedAt?: Date;
    publishedAt?: Date;
    noIndex?: boolean;
  }> = [];

  if (isDBConfigured() && (await connectDB())) {
    const [siteSettings, dbSeo, dbServices, dbProducts, dbCourses, dbArticles] = await Promise.all([
      SiteSettings.findOne({ key: 'main' }).select('seoCanonicalBaseUrl').lean(),
      SEOSettings.find({ noIndex: true }).select('pageKey').lean(),
      Service.find({ published: true }).select('name slug coverImage updatedAt noIndex').lean(),
      Product.find({ published: true }).select('name slug images updatedAt noIndex').lean(),
      Course.find({ published: true }).select('title slug coverImage updatedAt noIndex').lean(),
      Article.find({ status: 'published' })
        .select('title slug featuredImage updatedAt publishedAt noIndex')
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
      const isFresh = path === '/' || path === '/learn' || path === '/insights';
      const isMonthly = path.startsWith('/legal/') || path === '/about' || path === '/contact';
      urls.push({
        loc: `${baseUrl}${path}`,
        changefreq: isFresh ? 'daily' : isMonthly ? 'monthly' : 'weekly',
        priority: path === '/' ? '1.0' : path === '/learn' || path === '/solutions' ? '0.9' : '0.8',
      });
    }
  }

  for (const s of services) {
    urls.push({
      loc: `${baseUrl}/solutions/${s.slug}`,
      lastmod: s.updatedAt ? new Date(s.updatedAt).toISOString() : undefined,
      changefreq: 'weekly',
      priority: '0.85',
      ...(s.coverImage?.trim()
        ? {
            image: {
              loc: resolveAbsoluteAssetUrl(s.coverImage, baseUrl, '/og-image.png'),
              title: cleanText(s.name, 140),
            },
          }
        : {}),
    });
  }

  for (const p of products) {
    const firstImg = Array.isArray(p.images) && typeof p.images[0] === 'string' ? p.images[0] : '';
    urls.push({
      loc: `${baseUrl}/products/${p.slug}`,
      lastmod: p.updatedAt ? new Date(p.updatedAt).toISOString() : undefined,
      changefreq: 'weekly',
      priority: '0.8',
      ...(firstImg.trim()
        ? {
            image: {
              loc: resolveAbsoluteAssetUrl(firstImg, baseUrl, '/og-image.png'),
              title: cleanText(p.name, 140),
            },
          }
        : {}),
    });
  }

  for (const c of courses) {
    urls.push({
      loc: `${baseUrl}/learn/${c.slug}`,
      lastmod: c.updatedAt ? new Date(c.updatedAt).toISOString() : undefined,
      changefreq: 'weekly',
      priority: '0.85',
      ...(c.coverImage?.trim()
        ? {
            image: {
              loc: resolveAbsoluteAssetUrl(c.coverImage, baseUrl, '/og-image.png'),
              title: cleanText(c.title, 140),
            },
          }
        : {}),
    });
  }

  for (const a of articles) {
    const dt = a.updatedAt || a.publishedAt;
    urls.push({
      loc: `${baseUrl}/insights/${a.slug}`,
      lastmod: dt ? new Date(dt).toISOString() : undefined,
      changefreq: 'weekly',
      priority: '0.75',
      ...(a.featuredImage?.trim()
        ? {
            image: {
              loc: resolveAbsoluteAssetUrl(a.featuredImage, baseUrl, '/og-image.png'),
              title: cleanText(a.title, 140),
            },
          }
        : {}),
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls
  .map(
    (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${escapeXml(u.lastmod)}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${
      u.image
        ? `\n    <image:image>\n      <image:loc>${escapeXml(u.image.loc)}</image:loc>${
            u.image.title ? `\n      <image:title>${escapeXml(u.image.title)}</image:title>` : ''
          }\n    </image:image>`
        : ''
    }
  </url>`
  )
  .join('\n')}
</urlset>`;

  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.type('application/xml').send(xml);
});

/**
 * GET /api/seo/metadata
 * Dynamically resolves page, LMS course, product, service, or article SEO metadata
 * and Schema.org JSON-LD directly from MongoDB (with graceful defaults when DB is offline).
 */
router.get('/api/seo/metadata', async (req, res) => {
  try {
    const rawType = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : '';
    if (rawType && !ALLOWED_QUERY_TYPES.has(rawType as SeoQueryType)) {
      return res.status(400).json({
        error: 'Invalid SEO metadata type. Allowed values: page, course, product, service, article.',
      });
    }

    const resolved = await resolveSeoMetadataForPath(req, req.query.path, {
      type: rawType,
      slug: typeof req.query.slug === 'string' ? req.query.slug : undefined,
      pageKey: typeof req.query.pageKey === 'string' ? req.query.pageKey : undefined,
    });

    if (!resolved.found || resolved.entityType === 'private' || resolved.meta.noIndex) {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    }

    return res.status(resolved.found ? 200 : 404).json({
      ok: true,
      found: resolved.found,
      dbConnected: resolved.ctx.dbReady,
      entityType: resolved.entityType,
      path: resolved.path,
      pageKey: resolved.pageKey,
      slug: resolved.slug,
      updatedAt: resolved.updatedAt,
      meta: resolved.meta,
      ...(resolved.entitySummary ? { entity: resolved.entitySummary } : {}),
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
      const ratingsEnabled = c.ratingsEnabled !== false;
      const rawStats = courseStatsMap.get(String(c._id)) || {
        moduleCount: 0,
        lessonCount: 0,
        averageRating: 0,
        reviewCount: 0,
      };
      const stats = ratingsEnabled
        ? rawStats
        : { ...rawStats, averageRating: 0, reviewCount: 0 };
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
        ratingsEnabled,
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
