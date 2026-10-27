import path from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import type { Express } from 'express';
import { env } from './env';

/**
 * Подключает фронтенд:
 * - production — собранный Vite `dist/client` + SPA-fallback;
 * - development — сервер Vite в режиме middleware (HMR, единый порт, без прокси).
 */
export async function attachFrontend(app: Express): Promise<void> {
  if (env.isProd) {
    const dist = path.join(env.root, 'dist', 'client');
    const indexHtml = path.join(dist, 'index.html');
    app.use(express.static(dist, { index: false, maxAge: '1h', fallthrough: true }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api')) return next();
      if (!existsSync(indexHtml)) {
        res
          .status(503)
          .type('text/plain; charset=utf-8')
          .send('Фронтенд не собран. Выполните: npm run build');
        return;
      }
      res.sendFile(indexHtml);
    });
    return;
  }

  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}
