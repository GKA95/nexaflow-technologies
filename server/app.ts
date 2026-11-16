import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { csrfOriginCheck } from './middleware/auth.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import learnerRoutes from './routes/learner.js';
import paymentRoutes from './routes/payments.js';
import publicRoutes from './routes/public.js';
import seoRoutes from './routes/seo.js';

export function createExpressApp() {
  const app = express();

  app.set('trust proxy', 1);

  // Security headers (allow iframe preview, OAuth popups, YouTube embeds, and GA4)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      frameguard: false,
    })
  );

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
  app.use(express.urlencoded({ extended: true }));

  app.use(csrfOriginCheck);

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

  // Global JSON error handler for Express API routes
  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) return next(err);
      console.error('[Server] Unhandled request error:', err);
      if (req.path.startsWith('/api')) {
        const message = err instanceof Error ? err.message : 'Internal server error.';
        return res.status(500).json({ error: message });
      }
      next(err);
    }
  );

  return app;
}
