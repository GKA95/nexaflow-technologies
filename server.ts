import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createExpressApp } from './server/app.js';
import { connectDB, isDBConfigured } from './server/db.js';
import { renderSeoInjectedHtml } from './server/routes/seo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = createExpressApp();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Pre-warm MongoDB connection if configured
  if (isDBConfigured()) {
    connectDB().catch((err) => {
      console.warn('[Server] Initial MongoDB warm-up deferred:', err?.message);
    });
  } else {
    console.info('[Server] MONGODB_URI not configured yet; running in Configuration-Pending mode.');
  }

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), { maxAge: '365d', immutable: true })
    );
    app.use(
      '/fonts',
      express.static(path.join(distPath, 'fonts'), { maxAge: '365d', immutable: true })
    );
    app.use(
      express.static(distPath, {
        maxAge: '1d',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (req, res) => {
      void renderSeoInjectedHtml(req, res, path.join(distPath, 'index.html'));
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
