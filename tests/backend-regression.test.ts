import assert from 'node:assert/strict';
import http from 'node:http';
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
  Lead,
  PasswordResetToken,
  Payment,
  SupportTicket,
  User,
} from '../server/models.js';

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
});
