// Простой скользящий лимит запросов в памяти (по IP + имя правила).
// БД-лимиты на создание контента — отдельно, в services/quotas.

import type { NextFunction, Request, Response } from 'express';
import { tooManyRequests } from '../lib/errors';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000);
sweeper.unref?.();

/** Множитель для тестов: RATE_LIMIT_SCALE=100 послабляет лимиты в тестовом окружении. */
function scale(): number {
  const raw = Number(process.env.RATE_LIMIT_SCALE ?? 1);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

export function rateLimit(options: {
  name: string;
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
  message?: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const base = options.key ? options.key(req) : String(req.ip ?? 'unknown');
    const key = `${base}|${options.name}`;
    const now = Date.now();
    const limit = Math.round(options.max * scale());

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      const remaining = Math.max(0, limit - 1);
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      return next();
    }

    bucket.count += 1;
    const remaining = Math.max(0, limit - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (bucket.count > limit) {
      const seconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(seconds));
      next(
        tooManyRequests(
          options.message ?? `Слишком много запросов. Попробуйте через ${seconds} с.`,
        ),
      );
      return;
    }
    next();
  };
}

/** Тестовый сброс (используется интеграционными тестами). */
export function resetRateLimits(): void {
  buckets.clear();
}
