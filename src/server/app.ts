import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { env } from './env';
import { dbState, ensureDbReady } from './db/ready';
import { AppError } from './lib/errors';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { commentsRouter, postsRouter, reactionsRouter } from './routes/posts';
import { applicationsRouter } from './routes/applications';
import { notificationsRouter } from './routes/notifications';
import { adminRouter } from './routes/admin';
import { catalogRouter } from './routes/catalog';

export const SESSION_COOKIE = 'nuffy_sid';

/** Понятная ошибка для API-ответов. */
function toErrorResponse(error: unknown): { status: number; body: unknown } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message, details: error.details } },
    };
  }
  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || '_';
      (details[key] ??= []).push(issue.message);
    }
    return {
      status: 400,
      body: { error: { code: 'validation', message: 'Проверьте правильность заполнения полей.', details } },
    };
  }
  return {
    status: 500,
    body: { error: { code: 'internal', message: 'Внутренняя ошибка сервера. Попробуйте позже.' } },
  };
}

function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (env.isProd) {
    // В production контент почти полностью собственный; inline-стили разрешены для CSS-переменных темы.
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    );
  }
  next();
}

/**
 * Защита от межсайтовой подделки запросов: браузер всегда присылает Origin
 * при кросс-сайтовом запросе. Запросы без Origin (наши инструменты, тесты) проходят,
 * поскольку сессионная cookie SameSite=Lax и так защищает от чтения из чужого контекста.
 */
function originCheck(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const allowed = new Set<string>(env.allowedOrigins);
  allowed.add(`http://${req.headers.host ?? ''}`);
  allowed.add(`https://${req.headers.host ?? ''}`);
  if (allowed.has(origin)) return next();
  res.status(403).json({
    error: { code: 'bad_origin', message: 'Запрос с недопустимого источника отклонён.' },
  });
}

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(securityHeaders);
  app.use(originCheck);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'nuffy', time: new Date().toISOString() });
  });

  // Флаги для клиента. Только не-секретные булевы значения.
  app.get('/api/meta', (_req, res) => {
    const state = dbState();
    res.json({
      service: 'nuffy',
      oauth: { configured: env.google.configured },
      devLogin: { enabled: env.devLoginEnabled },
      db: { configured: Boolean(env.databaseUrl), ready: state.ready },
    });
  });

  // Ворота базы данных: без неё API отвечает понятной безопасной ошибкой,
  // а сервер и интерфейс при этом продолжают работать.
  app.use('/api', async (req, res, next) => {
    if (req.path === '/health' || req.path === '/meta') return;
    const ready = await ensureDbReady();
    if (!ready) {
      const state = dbState();
      res.status(503).json({
        error: {
          code: state.code ?? 'db_unavailable',
          message: state.message ?? 'База данных недоступна.',
        },
      });
      return;
    }
    next();
  });

  // Маршруты приложения подключаются здесь (см. src/server/routes).
  // ВАЖНО: регистрировать ДО middleware статики/Vite.
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/posts', postsRouter);
  app.use('/api/comments', commentsRouter);
  app.use('/api/reactions', reactionsRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', catalogRouter);

  // Неизвестные API-маршруты — явный JSON-404 вместо HTML.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Неизвестный маршрут API.' } });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const { status, body } = toErrorResponse(error);
    if (status >= 500) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[server] internal error:', message.split('\n')[0]?.slice(0, 300));
    }
    res.status(status).json(body);
  });

  return app;
}
