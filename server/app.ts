import 'dotenv/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import {
  csrfOriginCheck,
  enforceHttpsInProduction,
  generalApiLimiter,
  sanitizeRequestInputs,
} from './middleware/auth.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import learnerRoutes from './routes/learner.js';
import paymentRoutes from './routes/payments.js';
import publicRoutes from './routes/public.js';
import seoRoutes, { renderSeoInjectedHtml } from './routes/seo.js';

function getConfiguredOrigins(): Set<string> {
  const allowed = new Set<string>();
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl && /^https?:\/\//i.test(appUrl)) {
    try {
      allowed.add(new URL(appUrl).origin);
    } catch {
      // ignore invalid URL
    }
  }
  const extra = process.env.ALLOWED_ORIGINS?.trim();
  if (extra) {
    for (const raw of extra.split(',')) {
      const s = raw.trim();
      if (!s) continue;
      try {
        allowed.add(new URL(s).origin);
      } catch {
        // ignore invalid origin
      }
    }
  }
  return allowed;
}

export function createExpressApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(enforceHttpsInProduction);

  // Security headers (CSP, HSTS, Referrer-Policy, nosniff, Permissions-Policy; keep iframe preview & OAuth popups functional)
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://www.googletagmanager.com',
            'https://js.paystack.co',
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: [
            "'self'",
            'https://api.paystack.co',
            'https://www.google-analytics.com',
            'https://region1.google-analytics.com',
            'https://www.googletagmanager.com',
          ],
          frameSrc: [
            "'self'",
            'https://www.youtube.com',
            'https://www.youtube-nocookie.com',
            'https://checkout.paystack.com',
            'https://accounts.google.com',
          ],
          formAction: ["'self'", 'https://checkout.paystack.com'],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      frameguard: false,
    })
  );

  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Strict request-aware CORS policy
  app.use((req, res, next) => {
    const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0]
      .trim();
    const configuredOrigins = getConfiguredOrigins();

    return cors({
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        try {
          const parsed = new URL(origin);
          if (reqHost && parsed.host === reqHost) {
            return callback(null, true);
          }
          if (configuredOrigins.has(parsed.origin)) {
            return callback(null, true);
          }
        } catch {
          return callback(new Error('CORS origin rejected'));
        }
        return callback(new Error('CORS origin rejected'));
      },
    })(req, res, next);
  });

  app.use(cookieParser());

  // Preserve rawBody for Paystack webhook HMAC-SHA512 verification
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.use(sanitizeRequestInputs);
  app.use(csrfOriginCheck);

  // Global API rate limiter (excludes authenticated webhook path which uses HMAC-SHA512)
  app.use('/api', generalApiLimiter);

  // SEO XML Sitemap & Robots.txt
  app.use('/', seoRoutes);

  // API Routes
  app.use('/api/public', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/learner', learnerRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/admin', adminRoutes);

  // Ensure unknown /api routes return JSON 404 rather than HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // On Vercel serverless deployments, serve SSR SEO-injected HTML when bot rewrites route here
  if (process.env.VERCEL) {
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      const distHtmlPath = path.resolve(process.cwd(), 'dist', 'index.html');
      return renderSeoInjectedHtml(req, res, distHtmlPath);
    });
  }

  // Global JSON error handler for Express API routes (no stack traces or internal leaks in production)
  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) return next(err);
      const isProd = process.env.NODE_ENV === 'production';
      if (err instanceof Error && err.message === 'CORS origin rejected') {
        return res.status(403).json({ error: 'Cross-origin request rejected.' });
      }
      const errName = err instanceof Error ? err.name : '';
      const errMsg = err instanceof Error ? err.message : 'Error';
      console.error('[Server] Unhandled request error:', isProd ? `${errName}: ${errMsg}` : err);
      if (req.originalUrl.startsWith('/api') || req.path.startsWith('/api')) {
        if (
          errName === 'MongoServerSelectionError' ||
          errName === 'MongoNetworkTimeoutError' ||
          errName === 'MongoNotConnectedError'
        ) {
          return res.status(503).json({
            error: 'Database service temporarily unavailable. Please retry shortly.',
            code: 'DB_UNAVAILABLE',
          });
        }
        if (errName === 'ValidationError') {
          return res.status(400).json({
            error: !isProd ? errMsg : 'Invalid request payload.',
          });
        }
        const message = !isProd && errMsg ? errMsg : 'Internal server error.';
        return res.status(500).json({ error: message });
      }
      next(err);
    }
  );

  return app;
}
