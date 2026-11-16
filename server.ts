import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { connectDB, isDBConfigured } from './server/db.js';
import { csrfOriginCheck } from './server/middleware/auth.js';
import adminRoutes from './server/routes/admin.js';
import authRoutes from './server/routes/auth.js';
import learnerRoutes from './server/routes/learner.js';
import paymentRoutes from './server/routes/payments.js';
import publicRoutes from './server/routes/public.js';
import seoRoutes from './server/routes/seo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

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

  // Pre-warm MongoDB connection if configured
  if (isDBConfigured()) {
    connectDB().catch((err) => {
      console.warn('[Server] Initial MongoDB warm-up deferred:', err?.message);
    });
  } else {
    console.info('[Server] MONGODB_URI not configured yet; running in Configuration-Pending mode.');
  }

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

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath, { maxAge: '7d' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`NexaFlow Technologies server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
