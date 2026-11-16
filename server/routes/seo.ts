import { Router } from 'express';
import { connectDB, isDBConfigured } from '../db.js';
import { DEFAULT_PRODUCTS, DEFAULT_SERVICES } from '../defaults.js';
import { getBaseUrl as resolveRequestBaseUrl } from '../middleware/auth.js';
import { Article, Course, Product, SEOSettings, Service, SiteSettings } from '../models.js';

const router = Router();

function getBaseUrl(req: Parameters<typeof resolveRequestBaseUrl>[0], canonicalOverride?: string) {
  if (canonicalOverride?.trim()) {
    return canonicalOverride.trim().replace(/\/$/, '');
  }
  return resolveRequestBaseUrl(req);
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
      Service.find({ published: true, noIndex: { $ne: true } }).select('slug updatedAt').lean(),
      Product.find({ published: true, noIndex: { $ne: true } }).select('slug updatedAt').lean(),
      Course.find({ published: true, noIndex: { $ne: true } }).select('slug updatedAt').lean(),
      Article.find({ status: 'published', noIndex: { $ne: true } })
        .select('slug updatedAt publishedAt')
        .lean(),
    ]);
    const canonicalOverride = (siteSettings as { seoCanonicalBaseUrl?: string } | null)
      ?.seoCanonicalBaseUrl;
    if (canonicalOverride?.trim()) {
      baseUrl = getBaseUrl(req, canonicalOverride);
    }
    noIndexKeys = new Set(dbSeo.map((s: Record<string, unknown>) => String(s.pageKey)));
    services = dbServices as typeof services;
    products = dbProducts as typeof products;
    courses = dbCourses as typeof courses;
    articles = dbArticles as typeof articles;
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

export default router;
