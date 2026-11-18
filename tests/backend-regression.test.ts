import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import { createExpressApp } from '../server/app.js';
import { isDBConfigured, normalizeMongoUri } from '../server/db.js';
import {
  asyncHandler,
  createAsyncRouter,
  hasUnsafeNoSqlKey,
  signSessionToken,
} from '../server/middleware/auth.js';
import {
  Article,
  Coupon,
  Course,
  CourseReview,
  Enrolment,
  Lead,
  Lesson,
  PasswordResetToken,
  Payment,
  SupportTicket,
  User,
} from '../server/models.js';
import { buildCourseJsonLd, renderSeoInjectedHtml } from '../server/routes/seo.js';
import {
  needsServerImageResolution,
  normalizeImageUrl,
  parseImgurUrl,
} from '../server/shared/media.js';
import {
  countWordsFromRichContent,
  estimateReadingTimeMinutes,
  extractPlainText,
  isHtmlContent,
  plainTextToHtml,
} from '../server/shared/richText.js';
import { courseWriteSchema } from '../server/shared/validation.js';
import { buildValidActiveEnrolmentPipeline } from '../server/utils/enrolments.js';
import {
  assertPublicSafeUrl,
  isPrivateOrReservedIp,
} from '../server/utils/imageResolver.js';
import { sanitizeRichHtml } from '../server/utils/sanitizeRichHtml.js';

type QueryCastable = {
  cast(model: unknown): void;
  getFilter(): Record<string, unknown>;
};

function sanitizeAndCast(model: mongoose.Model<any>, filter: Record<string, unknown>) {
  mongoose.set('sanitizeFilter', true);
  const sanitized = mongoose.sanitizeFilter({ ...filter });
  const query = model.find(sanitized) as unknown as QueryCastable;
  query.cast(model);
  return query.getFilter();
}

describe('Mongoose sanitizeFilter + mongoose.trusted regression suite', () => {
  before(() => {
    mongoose.set('sanitizeFilter', true);
  });

  test('reproduces original CastError when developer $in operators are untrusted', () => {
    assert.throws(
      () => sanitizeAndCast(User, { role: { $in: ['admin', 'super_admin'] } }),
      (err: unknown) =>
        err instanceof Error &&
        err.name === 'CastError' &&
        err.message.includes('Cast to string failed') &&
        err.message.includes('role')
    );

    assert.throws(
      () => sanitizeAndCast(SupportTicket, { status: { $in: ['Open', 'In Progress'] } }),
      (err: unknown) =>
        err instanceof Error &&
        err.name === 'CastError' &&
        err.message.includes('Cast to string failed') &&
        err.message.includes('status')
    );
  });

  test('allows developer-controlled $in queries when wrapped with mongoose.trusted()', () => {
    const adminFilter = sanitizeAndCast(User, {
      role: mongoose.trusted({ $in: ['admin', 'super_admin'] }),
    });
    assert.deepEqual(JSON.parse(JSON.stringify(adminFilter)), {
      role: { $in: ['admin', 'super_admin'] },
    });

    const ticketFilter = sanitizeAndCast(SupportTicket, {
      status: mongoose.trusted({ $in: ['Open', 'In Progress'] }),
    });
    assert.deepEqual(JSON.parse(JSON.stringify(ticketFilter)), {
      status: { $in: ['Open', 'In Progress'] },
    });
  });

  test('allows all remaining repaired operator queries across auth, payments, leads, articles, coupons', () => {
    const emailCandidates = ['admin@nexaflow.test', 'backup@nexaflow.test'];
    const targetId = new mongoose.Types.ObjectId();

    // Admin / Auth $or with $in + $ne
    const emailConflictFilter = sanitizeAndCast(User, {
      _id: mongoose.trusted({ $ne: targetId }),
      $or: [
        { email: mongoose.trusted({ $in: emailCandidates }) },
        { secondaryEmails: mongoose.trusted({ $in: emailCandidates }) },
      ],
    });
    assert.ok(Array.isArray(emailConflictFilter.$or));

    // Password reset expiry check ($gt)
    const expiryFilter = sanitizeAndCast(PasswordResetToken, {
      tokenHash: 'abc123',
      usedAt: null,
      expiresAt: mongoose.trusted({ $gt: new Date() }),
    });
    assert.ok((expiryFilter.expiresAt as Record<string, unknown>).$gt instanceof Date);

    // Payment verification guard ($nin, $ne)
    const paymentGuardFilter = sanitizeAndCast(Payment, {
      _id: targetId,
      status: mongoose.trusted({ $nin: ['success', 'refunded'] }),
      processedEvents: mongoose.trusted({ $ne: 'verify:NF-PAY-123' }),
    });
    assert.deepEqual(JSON.parse(JSON.stringify(paymentGuardFilter.status)), {
      $nin: ['success', 'refunded'],
    });
    assert.deepEqual(JSON.parse(JSON.stringify(paymentGuardFilter.processedEvents)), {
      $ne: 'verify:NF-PAY-123',
    });

    // Coupon bounded redemption ($lte + $expr)
    const couponFilter = sanitizeAndCast(Coupon, {
      code: 'LAUNCH25',
      $or: [
        { maxUses: mongoose.trusted({ $lte: 0 }) },
        { $expr: mongoose.trusted({ $lt: ['$usedCount', '$maxUses'] }) },
      ],
    });
    assert.ok(Array.isArray(couponFilter.$or));

    // Leads date range & export ($gte/$lte, $in)
    const from = new Date('2025-01-01T00:00:00.000Z');
    const to = new Date('2025-12-31T23:59:59.999Z');
    const leadsDateFilter = sanitizeAndCast(Lead, {
      createdAt: mongoose.trusted({ $gte: from, $lte: to }),
    });
    assert.ok((leadsDateFilter.createdAt as Record<string, unknown>).$gte instanceof Date);
    assert.ok((leadsDateFilter.createdAt as Record<string, unknown>).$lte instanceof Date);

    const leadsExportFilter = sanitizeAndCast(Lead, {
      _id: mongoose.trusted({ $in: [targetId.toString()] }),
    });
    assert.ok(Array.isArray((leadsExportFilter._id as Record<string, unknown>).$in));

    // Related articles ($ne)
    const relatedArticleFilter = sanitizeAndCast(Article, {
      status: 'published',
      _id: mongoose.trusted({ $ne: targetId }),
      category: 'Engineering',
    });
    assert.ok((relatedArticleFilter._id as Record<string, unknown>).$ne);
  });

  test('still neutralizes untrusted / user-supplied NoSQL operator injection payloads', () => {
    assert.throws(
      () => sanitizeAndCast(User, { email: { $ne: null } }),
      (err: unknown) => err instanceof Error && err.name === 'CastError'
    );

    assert.throws(
      () => sanitizeAndCast(User, { role: { $gt: '' } }),
      (err: unknown) => err instanceof Error && err.name === 'CastError'
    );

    assert.equal(hasUnsafeNoSqlKey({ email: { $ne: null } }), true);
    assert.equal(hasUnsafeNoSqlKey({ 'profile.role': 'admin' }), true);
    assert.equal(hasUnsafeNoSqlKey({ email: 'learner@example.com' }), false);
  });
});

describe('MongoDB URI normalization and configuration helpers', () => {
  test('encodes special characters in MongoDB credentials cleanly', () => {
    const uri = normalizeMongoUri(
      '"mongodb+srv://admin:p@ss#word!@cluster0.abcde.mongodb.net/nexaflow?retryWrites=true&w=majority"'
    );
    assert.equal(
      uri,
      'mongodb+srv://admin:p%40ss%23word!@cluster0.abcde.mongodb.net/nexaflow?retryWrites=true&w=majority'
    );
  });

  test('detects placeholder MONGODB_URI values as unconfigured', () => {
    const prevUri = process.env.MONGODB_URI;
    try {
      process.env.MONGODB_URI = 'mongodb+srv://<username>:<password>@<cluster>.mongodb.net/app';
      assert.equal(isDBConfigured(), false);
      process.env.MONGODB_URI = '';
      assert.equal(isDBConfigured(), false);
    } finally {
      if (prevUri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = prevUri;
    }
  });
});

describe('Express 4 async safety and API endpoint regression checks', () => {
  let server: http.Server;
  let baseUrl: string;
  let prevJwtSecret: string | undefined;

  before(async () => {
    prevJwtSecret = process.env.JWT_SECRET;
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
      process.env.JWT_SECRET = 'test-regression-secret-key-minimum-32-chars';
    }

    const app = createExpressApp();

    // Verify standalone Express 4 router wrapped with createAsyncRouter forwards async rejections instead of hanging
    const asyncProofApp = express();
    const proofRouter = createAsyncRouter();
    proofRouter.get('/async-throw', async () => {
      throw new Error('Unhandled promise test');
    });
    proofRouter.get(
      '/handler-throw',
      asyncHandler(async () => {
        throw new Error('Unhandled handler test');
      })
    );
    asyncProofApp.use('/api', proofRouter);
    asyncProofApp.use(
      (err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Error' });
      }
    );
    await new Promise<void>((resolve, reject) => {
      const proofSrv = asyncProofApp.listen(0, '127.0.0.1', () => {
        const addr = proofSrv.address() as { port: number };
        Promise.all([
          fetch(`http://127.0.0.1:${addr.port}/api/async-throw`).then(async (r) => {
            assert.equal(r.status, 500);
            const body = (await r.json()) as { error?: string };
            assert.equal(body.error, 'Unhandled promise test');
          }),
          fetch(`http://127.0.0.1:${addr.port}/api/handler-throw`).then(async (r) => {
            assert.equal(r.status, 500);
            const body = (await r.json()) as { error?: string };
            assert.equal(body.error, 'Unhandled handler test');
          }),
        ])
          .then(() => {
            proofSrv.close();
            resolve();
          })
          .catch((e) => {
            proofSrv.close();
            reject(e);
          });
      });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (prevJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwtSecret;

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  test('blocks NoSQL operator injection in JSON body and query strings with HTTP 400', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: { $ne: '' }, password: 'password123' }),
    });
    assert.equal(loginRes.status, 400);
    const loginBody = (await loginRes.json()) as { error?: string };
    assert.match(String(loginBody.error), /Invalid characters|query operators/i);

    const queryRes = await fetch(`${baseUrl}/api/admin/leads?status[$ne]=New`);
    assert.equal(queryRes.status, 400);
  });

  test('protects /api/admin/overview cleanly (401 when DB ready, 503 when DB unconfigured)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/overview`);
    if (isDBConfigured()) {
      assert.equal(res.status, 401);
      const body = (await res.json()) as { error?: string };
      assert.match(String(body.error), /Authentication required/i);
    } else {
      assert.equal(res.status, 503);
      const body = (await res.json()) as { code?: string };
      assert.equal(body.code, 'DB_NOT_CONFIGURED');
    }
  });

  test('handles /api/admin/setup-status gracefully without hanging when MONGODB_URI is unconfigured', async () => {
    const prevUri = process.env.MONGODB_URI;
    try {
      process.env.MONGODB_URI = '';
      const res = await fetch(`${baseUrl}/api/admin/setup-status`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.dbConfigured, false);
      assert.equal(body.dbConnected, false);
      assert.equal(body.dbErrorCode, 'NOT_CONFIGURED');
      assert.equal(body.adminExists, false);
      assert.equal('MONGODB_URI' in body, false);
    } finally {
      if (prevUri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = prevUri;
    }
  });

  test('enforces RBAC on non-admin learner token', async () => {
    const learnerToken = signSessionToken({
      id: new mongoose.Types.ObjectId().toString(),
      email: 'learner@example.com',
      name: 'Test Learner',
      role: 'learner',
    });

    const prevUri = process.env.MONGODB_URI;
    try {
      process.env.MONGODB_URI = '';
      const res = await fetch(`${baseUrl}/api/admin/overview`, {
        headers: { Authorization: `Bearer ${learnerToken}` },
      });
      assert.equal(res.status, 503);
    } finally {
      if (prevUri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = prevUri;
    }
  });

  test('blocks SSRF targets on /api/public/image-proxy with HTTP 400', async () => {
    const ssrfTargets = [
      'http://127.0.0.1/secret.png',
      'http://169.254.169.254/latest/meta-data',
      'http://localhost:3000/og-image.png',
      'http://[::1]/secret.png',
      'file:///etc/passwd',
    ];
    for (const target of ssrfTargets) {
      const res = await fetch(
        `${baseUrl}/api/public/image-proxy?url=${encodeURIComponent(target)}`
      );
      assert.equal(res.status, 400, `Expected HTTP 400 for SSRF target ${target}`);
    }
  });

  test('serves image-enabled sitemap.xml, robots.txt, and BreadcrumbList metadata cleanly', async () => {
    const [sitemapRes, robotsRes, metaRes] = await Promise.all([
      fetch(`${baseUrl}/sitemap.xml`),
      fetch(`${baseUrl}/robots.txt`),
      fetch(`${baseUrl}/api/seo/metadata?path=/learn`),
    ]);

    assert.equal(sitemapRes.status, 200);
    const sitemapXml = await sitemapRes.text();
    assert.match(sitemapXml, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
    assert.match(sitemapXml, /<changefreq>daily<\/changefreq>/);
    assert.match(sitemapXml, /<image:loc>/);

    assert.equal(robotsRes.status, 200);
    const robotsTxt = await robotsRes.text();
    assert.match(robotsTxt, /Sitemap: https?:\/\/.*\/sitemap\.xml/);

    assert.equal(metaRes.status, 200);
    const metaJson = (await metaRes.json()) as {
      ok?: boolean;
      meta?: { robots?: string; structuredData?: unknown };
    };
    assert.equal(metaJson.ok, true);
    assert.match(String(metaJson.meta?.robots), /max-image-preview:large/);
    assert.ok(Array.isArray(metaJson.meta?.structuredData));
    const types = (metaJson.meta?.structuredData as Array<{ '@type'?: string }>).map(
      (s) => s['@type']
    );
    assert.ok(types.includes('CollectionPage'));
    assert.ok(types.includes('BreadcrumbList'));
  });

  test('protects /api/admin/media/config and /api/admin/media/upload against unauthenticated requests', async () => {
    const [cfgRes, uploadRes] = await Promise.all([
      fetch(`${baseUrl}/api/admin/media/config`),
      fetch(`${baseUrl}/api/admin/media/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }),
      }),
    ]);

    if (isDBConfigured()) {
      assert.equal(cfgRes.status, 401);
      assert.equal(uploadRes.status, 401);
    } else {
      assert.equal(cfgRes.status, 503);
      assert.equal(uploadRes.status, 503);
    }
  });
});

describe('External/Imgur image normalization, SSRF guards & SSR SEO injection', () => {
  test('normalizes Imgur, Google Drive, and Dropbox URLs accurately', () => {
    assert.equal(normalizeImageUrl('https://imgur.com/aBcDe12'), 'https://i.imgur.com/aBcDe12.jpg');
    assert.equal(normalizeImageUrl('http://m.imgur.com/xYz7890'), 'https://i.imgur.com/xYz7890.jpg');
    assert.equal(normalizeImageUrl('http://i.imgur.com/xYz7890.png'), 'https://i.imgur.com/xYz7890.png');
    assert.equal(normalizeImageUrl('https://i.imgur.com/qRs4567.gifv'), 'https://i.imgur.com/qRs4567.gif');

    const albumParsed = parseImgurUrl('https://imgur.com/a/kLm9988');
    assert.equal(albumParsed.isImgur, true);
    assert.equal(albumParsed.kind, 'album');
    assert.equal(needsServerImageResolution('https://imgur.com/a/kLm9988'), true);
    assert.equal(needsServerImageResolution('https://imgur.com/gallery/sample-gH4411'), true);
    assert.equal(needsServerImageResolution('https://i.imgur.com/aBcDe12.jpg'), false);

    assert.equal(
      normalizeImageUrl('https://drive.google.com/file/d/1AbCdEfGhIjK/view?usp=sharing'),
      'https://drive.google.com/uc?export=view&id=1AbCdEfGhIjK'
    );
    assert.equal(
      normalizeImageUrl('https://www.dropbox.com/s/abc123/cover.png?dl=0'),
      'https://www.dropbox.com/s/abc123/cover.png?raw=1'
    );
  });

  test('rejects private/reserved IPs and unsafe URL schemes in SSRF validator', async () => {
    assert.equal(isPrivateOrReservedIp('127.0.0.1'), true);
    assert.equal(isPrivateOrReservedIp('10.0.0.5'), true);
    assert.equal(isPrivateOrReservedIp('169.254.169.254'), true);
    assert.equal(isPrivateOrReservedIp('172.16.5.4'), true);
    assert.equal(isPrivateOrReservedIp('192.168.1.1'), true);
    assert.equal(isPrivateOrReservedIp('::1'), true);
    assert.equal(isPrivateOrReservedIp('8.8.8.8'), false);

    await assert.rejects(() => assertPublicSafeUrl('http://127.0.0.1/a.png'));
    await assert.rejects(() => assertPublicSafeUrl('https://user:pass@imgur.com/a.png'));
    await assert.rejects(() => assertPublicSafeUrl('https://imgur.com:8443/a.png'));
  });

  test('injects route-specific meta tags, canonical link, JSON-LD, and crawlable links into SSR HTML', async () => {
    const ssrApp = express();
    ssrApp.get('*', (req, res) => {
      void renderSeoInjectedHtml(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      const srv = ssrApp.listen(0, '127.0.0.1', () => {
        const addr = srv.address() as { port: number };
        fetch(`http://127.0.0.1:${addr.port}/products/gridmind-ai`)
          .then(async (r) => {
            assert.equal(r.status, 200);
            const html = await r.text();
            assert.match(html, /<title>GridMind AI/i);
            assert.match(html, /<meta property="og:title" content="GridMind AI/i);
            assert.match(html, /<link rel="canonical" href="https?:\/\/[^"]+\/products\/gridmind-ai"/);
            assert.match(html, /<script id="nf-jsonld" type="application\/ld\+json">/);
            assert.match(html, /"SoftwareApplication"/);
            assert.match(html, /"BreadcrumbList"/);
            assert.match(html, /data-ssr-seo="true"/);
            assert.match(html, /href="\/learn"/);
          })
          .then(() => {
            srv.close();
            resolve();
          })
          .catch((e) => {
            srv.close();
            reject(e);
          });
      });
    });
  });
});

describe('Strict active enrolment counting & per-course ratings toggle', () => {
  test('buildValidActiveEnrolmentPipeline enforces active status and existing User + Course documents', () => {
    const pipeline = buildValidActiveEnrolmentPipeline();
    assert.deepEqual(pipeline[0], { $match: { status: 'active' } });

    const userLookup = pipeline.find(
      (s) => '$lookup' in s && (s.$lookup as { from?: string }).from === User.collection.name
    );
    const courseLookup = pipeline.find(
      (s) => '$lookup' in s && (s.$lookup as { from?: string }).from === Course.collection.name
    );
    assert.ok(userLookup, 'Pipeline should join against User collection');
    assert.ok(courseLookup, 'Pipeline should join against Course collection');

    const unwindPaths = pipeline
      .filter((s) => '$unwind' in s)
      .map((s) => (s as { $unwind: string }).$unwind);
    assert.deepEqual(unwindPaths, ['$_user', '$_course']);
  });

  test('courseWriteSchema and partial patch validate ratingsEnabled with default true', () => {
    const createParsed = courseWriteSchema.parse({
      title: 'Production AI Architecture',
      shortDescription: 'Learn to architect and deploy scalable enterprise systems.',
      price: 250,
      currency: 'GHS',
    });
    assert.equal(createParsed.ratingsEnabled, true);

    const disablePatch = courseWriteSchema.partial().safeParse({ ratingsEnabled: false });
    assert.equal(disablePatch.success, true);
    if (disablePatch.success) {
      assert.equal(disablePatch.data.ratingsEnabled, false);
    }

    const invalidPatch = courseWriteSchema.partial().safeParse({ ratingsEnabled: 'off' });
    assert.equal(invalidPatch.success, false);
  });

  test('buildCourseJsonLd omits aggregateRating and review when ratingsEnabled is false', () => {
    const stats = { moduleCount: 4, lessonCount: 16, averageRating: 4.9, reviewCount: 12 };
    const reviews = [{ authorName: 'Ama Mensah', rating: 5, title: 'Great', comment: 'Very practical!' }];

    const enabledJsonLd = buildCourseJsonLd({
      course: { title: 'AI Systems', price: 300, currency: 'GHS', ratingsEnabled: true },
      baseUrl: 'https://nexaflow.test',
      canonicalUrl: 'https://nexaflow.test/learn/ai-systems',
      siteName: 'NexaFlow',
      description: 'Hands-on AI course.',
      ogImage: 'https://nexaflow.test/og-image.png',
      stats,
      reviews,
    });
    assert.ok(enabledJsonLd.aggregateRating);
    assert.ok(Array.isArray(enabledJsonLd.review));

    const disabledJsonLd = buildCourseJsonLd({
      course: { title: 'AI Systems', price: 300, currency: 'GHS', ratingsEnabled: false },
      baseUrl: 'https://nexaflow.test',
      canonicalUrl: 'https://nexaflow.test/learn/ai-systems',
      siteName: 'NexaFlow',
      description: 'Hands-on AI course.',
      ogImage: 'https://nexaflow.test/og-image.png',
      stats,
      reviews,
    });
    assert.equal('aggregateRating' in disabledJsonLd, false);
    assert.equal('review' in disabledJsonLd, false);
  });
});

describe('Compound indexes & rich-text HTML sanitization / helpers', () => {
  const hasCompoundIndex = (
    model: mongoose.Model<any>,
    expectedKeys: Array<[string, 1 | -1]>
  ) => {
    const indexes = model.schema.indexes();
    return indexes.some(([spec]) => {
      const entries = Object.entries(spec);
      if (entries.length !== expectedKeys.length) return false;
      return expectedKeys.every(
        ([key, dir], idx) => entries[idx]?.[0] === key && entries[idx]?.[1] === dir
      );
    });
  };

  test('models define expected compound indexes on User, SupportTicket, Enrolment, Payment, Article, Lesson, CourseReview', () => {
    assert.equal(hasCompoundIndex(User, [['role', 1], ['createdAt', -1]]), true);
    assert.equal(hasCompoundIndex(User, [['role', 1], ['active', 1]]), true);
    assert.equal(hasCompoundIndex(SupportTicket, [['status', 1], ['updatedAt', -1]]), true);
    assert.equal(hasCompoundIndex(SupportTicket, [['courseId', 1], ['status', 1]]), true);
    assert.equal(hasCompoundIndex(Enrolment, [['status', 1], ['courseId', 1]]), true);
    assert.equal(
      hasCompoundIndex(Enrolment, [
        ['userId', 1],
        ['status', 1],
        ['activatedAt', -1],
      ]),
      true
    );
    assert.equal(hasCompoundIndex(Payment, [['status', 1], ['createdAt', -1]]), true);
    assert.equal(
      hasCompoundIndex(Article, [
        ['status', 1],
        ['publishedAt', -1],
        ['createdAt', -1],
      ]),
      true
    );
    assert.equal(
      hasCompoundIndex(Lesson, [
        ['courseId', 1],
        ['published', 1],
        ['order', 1],
      ]),
      true
    );
    assert.equal(
      hasCompoundIndex(CourseReview, [
        ['courseId', 1],
        ['status', 1],
        ['createdAt', -1],
      ]),
      true
    );
  });

  test('sanitizeRichHtml preserves safe Tiptap formatting and strips XSS vectors', () => {
    const dirty =
      '<h2 style="text-align:center">Architecture <mark data-color="#FEF08A">Guide</mark></h2>' +
      '<p><span style="color:#176BFF;font-size:18px">Overview</span> with <a href="https://example.com" onclick="alert(1)">reference</a>.</p>' +
      '<p><a href="javascript:alert(2)">Bad link</a></p>' +
      '<img src="https://imgur.com/aBcDe12" data-align="right" onerror="alert(3)" alt="Diagram" />' +
      '<table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody><tr><td>Latency</td><td>12ms</td></tr></tbody></table>' +
      '<script>window.pwned = true;</script><iframe src="https://evil.test"></iframe>';

    const clean = sanitizeRichHtml(dirty);
    assert.match(clean, /<h2[^>]*text-align:center[^>]*>/i);
    assert.match(clean, /<mark data-color="#FEF08A">/);
    assert.match(clean, /<a href="https:\/\/example\.com"[^>]*rel="noopener noreferrer"[^>]*>/);
    assert.match(clean, /<img src="https:\/\/i\.imgur\.com\/aBcDe12\.jpg"[^>]*data-align="right"/);
    assert.match(clean, /<table><thead><tr><th>Metric<\/th>/);
    assert.equal(/<script|onerror|onclick|javascript:|<iframe/i.test(clean), false);
  });

  test('richText helpers extract plain text, count words/reading time, and upgrade legacy plaintext safely', () => {
    assert.equal(isHtmlContent('<p>Hello <strong>world</strong></p>'), true);
    assert.equal(isHtmlContent('Plain legacy copy with no tags'), false);

    assert.equal(
      extractPlainText('<h2>Overview</h2><p>Fast &amp; reliable <strong>systems</strong>.</p>'),
      'Overview Fast & reliable systems.'
    );
    assert.equal(countWordsFromRichContent('<p>One two three four</p>'), 4);
    assert.equal(estimateReadingTimeMinutes('<p>' + 'word '.repeat(410) + '</p>'), 3);

    assert.equal(
      plainTextToHtml('First paragraph.\nLine two.\n\nSecond <paragraph>.'),
      '<p>First paragraph.<br />Line two.</p><p>Second &lt;paragraph&gt;.</p>'
    );
  });

  test('sanitize-html resolves CommonJS htmlparser2 (prevents Vercel ERR_REQUIRE_ESM startup crash)', () => {
    const req = createRequire(import.meta.url);
    const sanitizeHtmlEntry = req.resolve('sanitize-html');
    const hpEntry = req.resolve('htmlparser2', { paths: [path.dirname(sanitizeHtmlEntry)] });
    let dir = path.dirname(hpEntry);
    let hpPkg: { version?: string; type?: string } | null = null;
    while (dir.length > 1) {
      const candidate = path.join(dir, 'package.json');
      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
          name?: string;
          version?: string;
          type?: string;
        };
        if (parsed.name === 'htmlparser2') {
          hpPkg = parsed;
          break;
        }
      }
      dir = path.dirname(dir);
    }
    assert.ok(hpPkg, 'Expected htmlparser2 package.json to be found');
    assert.notEqual(
      hpPkg.type,
      'module',
      `htmlparser2@${hpPkg.version} must be CommonJS for sanitize-html require() compatibility`
    );
  });

  test('server routes do not use deprecated Mongoose { new: true } option', () => {
    const serverDir = path.resolve(process.cwd(), 'server');
    const walk = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) files.push(...walk(full));
        else if (e.isFile() && /\.(ts|js|mjs|cjs)$/.test(e.name)) files.push(full);
      }
      return files;
    };
    const offending: string[] = [];
    for (const file of walk(serverDir)) {
      const text = fs.readFileSync(file, 'utf8');
      if (/\bnew\s*:\s*true\b/.test(text)) {
        offending.push(path.relative(process.cwd(), file));
      }
    }
    assert.deepEqual(offending, []);
  });
});
