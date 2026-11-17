import type {
  ArticleItem,
  CourseItem,
  PageMetaConfig,
  ProductItem,
  ResolvedMetaTags,
  SEOPageItem,
  ServiceItem,
  SiteSettings,
} from '../types';

function resolveAbsoluteUrl(value: string | undefined, origin: string, fallbackPath: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return `${origin}${fallbackPath}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${origin}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function normalizeKeywords(input?: string[] | string): string {
  if (!input) return '';
  if (Array.isArray(input)) {
    return Array.from(new Set(input.map((k) => k.trim()).filter(Boolean))).join(', ');
  }
  return input
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .join(', ');
}

export function resolveRouteMeta(params: {
  pathname: string;
  settings: SiteSettings | null;
  seoPages: SEOPageItem[];
  services: ServiceItem[];
  products: ProductItem[];
  featuredCourses: CourseItem[];
  featuredArticles: ArticleItem[];
  override: PageMetaConfig | null;
  remoteMeta?: Partial<ResolvedMetaTags> | null;
}): ResolvedMetaTags {
  const {
    pathname,
    settings,
    seoPages,
    services,
    products,
    featuredCourses,
    featuredArticles,
    override,
    remoteMeta,
  } = params;

  const cleanPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const canonicalOrigin =
    settings?.seoCanonicalBaseUrl?.trim()?.replace(/\/+$/, '') || browserOrigin;
  const siteName = settings?.businessName?.trim() || 'NexaFlow Technologies';
  const titleSuffix = settings?.seoTitleSuffix?.trim() || siteName;

  const globalTitle =
    settings?.seoSiteTitle?.trim() || `${siteName} | AI, Data & Digital Solutions`;
  const globalDescription =
    settings?.seoDefaultDescription?.trim() ||
    'NexaFlow Technologies delivers AI automation, web development, data analytics, machine learning, and structured technical training.';
  const globalKeywords = normalizeKeywords(settings?.seoDefaultKeywords);
  const globalOgTitle = settings?.seoOgTitle?.trim() || '';
  const globalOgDescription = settings?.seoOgDescription?.trim() || '';
  const globalOgImage = resolveAbsoluteUrl(settings?.seoOgImage, browserOrigin, '/og-image.png');
  const twitterCard = settings?.seoTwitterCard === 'summary' ? 'summary' : 'summary_large_image';
  const twitterSite = settings?.seoTwitterSite?.trim() || '';
  const globalNoIndex = settings?.seoRobotsDefault === 'noindex, nofollow';
  const structuredDataEnabled = settings?.seoStructuredDataEnabled !== false;

  const findSeo = (key: string) => seoPages.find((p) => p.pageKey === key);

  const applyPageSeo = (
    seo: SEOPageItem | undefined,
    fallbackTitle: string,
    fallbackDescription: string
  ) => {
    title = seo?.title?.trim() || fallbackTitle;
    description = seo?.description?.trim() || fallbackDescription;
    canonicalUrl = seo?.canonicalUrl?.trim() || canonicalUrl;
    ogTitle = seo?.ogTitle?.trim() || globalOgTitle;
    ogDescription = seo?.ogDescription?.trim() || globalOgDescription;
    ogImage = seo?.ogImage?.trim()
      ? resolveAbsoluteUrl(seo.ogImage, browserOrigin, '/og-image.png')
      : globalOgImage;
    keywords = normalizeKeywords(seo?.focusKeyword) || globalKeywords;
    noIndex = seo?.noIndex !== undefined ? Boolean(seo.noIndex) : globalNoIndex;
  };

  let title = globalTitle;
  let description = globalDescription;
  let canonicalUrl = `${canonicalOrigin}${cleanPath}`;
  let ogTitle = globalOgTitle;
  let ogDescription = globalOgDescription;
  let ogImage = globalOgImage;
  let ogType: 'website' | 'article' = 'website';
  let keywords = globalKeywords;
  let noIndex = globalNoIndex;
  let structuredData: Record<string, unknown> | Array<Record<string, unknown>> | null = null;

  if (cleanPath === '/') {
    const seo = findSeo('home');
    applyPageSeo(seo, globalTitle, globalDescription);
    ogTitle = seo?.ogTitle?.trim() || seo?.title?.trim() || globalOgTitle || title;
    ogDescription =
      seo?.ogDescription?.trim() || seo?.description?.trim() || globalOgDescription || description;
    structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: siteName,
      url: canonicalOrigin,
      description,
    };
  } else if (cleanPath === '/about') {
    applyPageSeo(findSeo('about'), `About ${siteName} | ${titleSuffix}`, globalDescription);
  } else if (cleanPath === '/solutions') {
    applyPageSeo(findSeo('solutions'), `Solutions & Services | ${titleSuffix}`, globalDescription);
  } else if (cleanPath.startsWith('/solutions/')) {
    const slug = cleanPath.slice('/solutions/'.length);
    const service = services.find((s) => s.slug === slug);
    if (service) {
      title = service.seoTitle?.trim() || `${service.name} | ${titleSuffix}`;
      description = service.seoDescription?.trim() || service.shortDescription || globalDescription;
      canonicalUrl = service.canonicalUrl?.trim() || canonicalUrl;
      ogImage = service.ogImage?.trim()
        ? resolveAbsoluteUrl(service.ogImage, browserOrigin, '/og-image.png')
        : service.coverImage?.trim()
          ? resolveAbsoluteUrl(service.coverImage, browserOrigin, '/og-image.png')
          : globalOgImage;
      keywords = normalizeKeywords(service.focusKeyword) || globalKeywords;
      noIndex = service.noIndex !== undefined ? Boolean(service.noIndex) : globalNoIndex;
    } else {
      title = `Solution Details | ${titleSuffix}`;
    }
  } else if (cleanPath === '/products') {
    applyPageSeo(findSeo('products'), `Products & Platforms | ${titleSuffix}`, globalDescription);
  } else if (cleanPath.startsWith('/products/')) {
    const slug = cleanPath.slice('/products/'.length);
    const product = products.find((p) => p.slug === slug);
    if (product) {
      title = product.seoTitle?.trim() || `${product.name} | ${titleSuffix}`;
      description = product.seoDescription?.trim() || product.shortDescription || globalDescription;
      canonicalUrl = product.canonicalUrl?.trim() || canonicalUrl;
      ogImage = product.ogImage?.trim()
        ? resolveAbsoluteUrl(product.ogImage, browserOrigin, '/og-image.png')
        : product.images?.[0]?.trim()
          ? resolveAbsoluteUrl(product.images[0], browserOrigin, '/og-image.png')
          : globalOgImage;
      keywords = normalizeKeywords(product.focusKeyword) || globalKeywords;
      noIndex = product.noIndex !== undefined ? Boolean(product.noIndex) : globalNoIndex;
    } else {
      title = `Product Overview | ${titleSuffix}`;
    }
  } else if (cleanPath === '/learn') {
    applyPageSeo(
      findSeo('learn'),
      `NexaFlow Learn | Practical AI, Data & Engineering Courses`,
      globalDescription
    );
  } else if (cleanPath.startsWith('/learn/')) {
    const slug = cleanPath.slice('/learn/'.length);
    const course = featuredCourses.find((c) => c.slug === slug);
    if (course) {
      title = course.seoTitle?.trim() || `${course.title} | NexaFlow Learn`;
      description = course.seoDescription?.trim() || course.shortDescription || globalDescription;
      canonicalUrl = course.canonicalUrl?.trim() || canonicalUrl;
      ogImage = course.ogImage?.trim()
        ? resolveAbsoluteUrl(course.ogImage, browserOrigin, '/og-image.png')
        : course.coverImage?.trim()
          ? resolveAbsoluteUrl(course.coverImage, browserOrigin, '/og-image.png')
          : globalOgImage;
      keywords = normalizeKeywords(course.focusKeyword) || globalKeywords;
      noIndex = course.noIndex !== undefined ? Boolean(course.noIndex) : globalNoIndex;
    } else {
      title = `Course Curriculum | NexaFlow Learn`;
    }
  } else if (cleanPath === '/insights') {
    applyPageSeo(
      findSeo('insights'),
      `Insights & Engineering Articles | ${titleSuffix}`,
      globalDescription
    );
  } else if (cleanPath.startsWith('/insights/')) {
    ogType = 'article';
    const slug = cleanPath.slice('/insights/'.length);
    const article = featuredArticles.find((a) => a.slug === slug);
    if (article) {
      title = article.seoTitle?.trim() || `${article.title} | NexaFlow Insights`;
      description = article.seoDescription?.trim() || article.excerpt || globalDescription;
      canonicalUrl = article.canonicalUrl?.trim() || canonicalUrl;
      ogImage = article.ogImage?.trim()
        ? resolveAbsoluteUrl(article.ogImage, browserOrigin, '/og-image.png')
        : article.featuredImage?.trim()
          ? resolveAbsoluteUrl(article.featuredImage, browserOrigin, '/og-image.png')
          : globalOgImage;
      keywords =
        normalizeKeywords([article.focusKeyword || '', ...(article.tags || [])]) || globalKeywords;
      noIndex = article.noIndex !== undefined ? Boolean(article.noIndex) : globalNoIndex;
    } else {
      title = `Insights Article | ${titleSuffix}`;
    }
  } else if (cleanPath === '/contact') {
    applyPageSeo(
      findSeo('contact'),
      `Contact & Consultation | ${titleSuffix}`,
      globalDescription
    );
  } else if (cleanPath.startsWith('/legal/')) {
    const type = cleanPath.slice('/legal/'.length);
    const legalNames: Record<string, string> = {
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
      cookies: 'Cookie & Analytics Notice',
      refund: 'Course & Refund Policy',
    };
    const label = legalNames[type] || 'Legal Governance';
    title = `${label} | ${titleSuffix}`;
    description = `Review the official ${label} for ${siteName} and NexaFlow Learn.`;
  } else if (cleanPath.startsWith('/portal-admin')) {
    title = `Administrator Portal | ${titleSuffix}`;
    description = `Protected ${siteName} administrator management portal.`;
    noIndex = true;
  } else if (cleanPath.startsWith('/learner')) {
    title = `Learner Portal | NexaFlow Learn`;
    description = 'Access your enrolled courses, lesson progress, and support tickets.';
    noIndex = true;
  } else if (cleanPath.startsWith('/auth')) {
    title = `Account Access | NexaFlow Learn`;
    description = 'Sign in, create a learner account, or reset your NexaFlow Learn password.';
    noIndex = true;
  } else {
    title = `Page Not Found | ${titleSuffix}`;
    description = `The requested page on ${siteName} could not be found.`;
    noIndex = true;
  }

  // Merge database-fetched metadata from /api/seo/metadata before component overrides
  const dbTitle = remoteMeta?.title?.trim() || title;
  const dbDescription = remoteMeta?.description?.trim() || description;
  const dbCanonical = remoteMeta?.canonicalUrl?.trim() || canonicalUrl;
  const dbOgTitle = remoteMeta?.ogTitle?.trim() || ogTitle;
  const dbOgDescription = remoteMeta?.ogDescription?.trim() || ogDescription;
  const dbOgImage = remoteMeta?.ogImage?.trim()
    ? resolveAbsoluteUrl(remoteMeta.ogImage, browserOrigin, '/og-image.png')
    : ogImage;
  const dbOgType = remoteMeta?.ogType || ogType;
  const dbKeywords = remoteMeta?.keywords ? normalizeKeywords(remoteMeta.keywords) : keywords;
  const dbNoIndex = remoteMeta?.noIndex !== undefined ? remoteMeta.noIndex : noIndex;
  const dbStructuredData =
    remoteMeta?.structuredData !== undefined ? remoteMeta.structuredData : structuredData;

  // Merge active component-level <SEOHead /> / setPageMeta override
  const finalTitle = override?.title?.trim() || dbTitle;
  const finalDescription = override?.description?.trim() || dbDescription;
  const finalCanonical = override?.canonicalUrl?.trim() || dbCanonical;
  const finalOgTitle = override?.ogTitle?.trim() || dbOgTitle || finalTitle;
  const finalOgDescription = override?.ogDescription?.trim() || dbOgDescription || finalDescription;
  const finalOgImage = override?.ogImage?.trim()
    ? resolveAbsoluteUrl(override.ogImage, browserOrigin, '/og-image.png')
    : dbOgImage || globalOgImage;
  const finalOgType = override?.ogType || dbOgType;
  const finalKeywords = override?.keywords ? normalizeKeywords(override.keywords) : dbKeywords;
  const finalNoIndex = override?.noIndex !== undefined ? override.noIndex : dbNoIndex;
  const finalStructuredData =
    structuredDataEnabled && !finalNoIndex
      ? override?.structuredData !== undefined
        ? override.structuredData
        : dbStructuredData
      : null;

  return {
    title: finalTitle,
    description: finalDescription,
    canonicalUrl: finalCanonical,
    ogTitle: finalOgTitle,
    ogDescription: finalOgDescription,
    ogImage: finalOgImage,
    ogType: finalOgType,
    twitterCard: remoteMeta?.twitterCard || twitterCard,
    twitterSite: remoteMeta?.twitterSite || twitterSite,
    siteName: remoteMeta?.siteName || siteName,
    keywords: finalKeywords,
    noIndex: finalNoIndex,
    structuredData: finalStructuredData,
  };
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function removeMeta(attr: 'name' | 'property', key: string) {
  const el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (el) el.remove();
}

export function applyDocumentHeadMeta(
  meta: ResolvedMetaTags,
  gscVerificationTag?: string
): void {
  if (typeof document === 'undefined') return;

  document.title = meta.title;

  upsertMeta('name', 'description', meta.description);
  upsertMeta('name', 'robots', meta.noIndex ? 'noindex, nofollow' : 'index, follow');

  if (meta.keywords) {
    upsertMeta('name', 'keywords', meta.keywords);
  } else {
    removeMeta('name', 'keywords');
  }

  // OpenGraph
  upsertMeta('property', 'og:type', meta.ogType);
  upsertMeta('property', 'og:site_name', meta.siteName);
  upsertMeta('property', 'og:title', meta.ogTitle);
  upsertMeta('property', 'og:description', meta.ogDescription);
  upsertMeta('property', 'og:url', meta.canonicalUrl);
  upsertMeta('property', 'og:image', meta.ogImage);
  upsertMeta('property', 'og:image:alt', meta.ogTitle);

  // Twitter / X Card
  upsertMeta('name', 'twitter:card', meta.twitterCard);
  upsertMeta('name', 'twitter:title', meta.ogTitle);
  upsertMeta('name', 'twitter:description', meta.ogDescription);
  upsertMeta('name', 'twitter:image', meta.ogImage);
  if (meta.twitterSite) {
    const formattedHandle = meta.twitterSite.startsWith('@')
      ? meta.twitterSite
      : `@${meta.twitterSite}`;
    upsertMeta('name', 'twitter:site', formattedHandle);
    upsertMeta('name', 'twitter:creator', formattedHandle);
  } else {
    removeMeta('name', 'twitter:site');
    removeMeta('name', 'twitter:creator');
  }

  // Canonical Link
  let linkCanonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!linkCanonical) {
    linkCanonical = document.createElement('link');
    linkCanonical.setAttribute('rel', 'canonical');
    document.head.appendChild(linkCanonical);
  }
  linkCanonical.setAttribute('href', meta.canonicalUrl);

  // Google Search Console verification tag
  if (gscVerificationTag?.trim()) {
    upsertMeta('name', 'google-site-verification', gscVerificationTag.trim());
  } else {
    removeMeta('name', 'google-site-verification');
  }

  // Schema.org JSON-LD
  const existingLd = document.getElementById('nf-jsonld');
  if (existingLd) existingLd.remove();

  if (meta.structuredData && !meta.noIndex) {
    const script = document.createElement('script');
    script.id = 'nf-jsonld';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(meta.structuredData);
    document.head.appendChild(script);
  }
}
