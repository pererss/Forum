// Сессии: cookie-токен → строка в sessions (хранится только SHA-256 хэш).

import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { one } from '../db/sql';
import { parseCookies, serializeCookie } from '../lib/cookies';
import { forbidden, unauthorized } from '../lib/errors';
import { normalizeSettings } from '../../shared/settings';
import type { SessionUser } from '../../shared/types';

export const SESSION_COOKIE = 'nuffy_sid';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Поля строки users, необходимые для формирования сессии. */
export type SessionUserRow = {
  id: string;
  username: string | null;
  display_name: string;
  email: string | null;
  role: SessionUser['role'];
  status: SessionUser['status'];
  xp: number;
  reputation: number;
  level: number;
  settings: unknown;
  created_at: Date | string;
  onboarded_at: Date | string | null;
};

type SessionRow = SessionUserRow & {
  session_id: string;
  expires_at: Date | string;
  last_seen_at: Date | string;
};

export function toSessionUser(row: SessionUserRow): SessionUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    status: row.status,
    level: row.level,
    xp: row.xp,
    reputation: row.reputation,
    onboarded: Boolean(row.username && row.onboarded_at),
    settings: normalizeSettings(row.settings),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const SESSION_SELECT = `
  SELECT s.id AS session_id, s.expires_at, s.last_seen_at,
         u.id, u.username, u.display_name, u.email, u.role, u.status,
         u.xp, u.reputation, u.level, u.settings, u.created_at, u.onboarded_at
  FROM sessions s
  JOIN users u ON u.id = s.user_id
`;

/** Определяет текущего пользователя по cookie. Аноним — не ошибка. */
export async function attachSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    req.user = null;
    req.sessionToken = null;
    req.sessionId = null;

    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return next();
    req.sessionToken = token;

    const row = await one<SessionRow>(`${SESSION_SELECT} WHERE s.token_hash = $1`, [hashToken(token)]);
    if (!row) return next();

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await one('DELETE FROM sessions WHERE id = $1', [row.session_id]);
      res.append('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAgeSeconds: 0 }));
      return next();
    }

    req.user = toSessionUser(row);
    req.sessionId = row.session_id;

    // Обновление last_seen — не чаще раза в 10 минут, без задержки ответа.
    if (Date.now() - new Date(row.last_seen_at).getTime() > 10 * 60_000) {
      void one('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.session_id]).catch(
        () => {},
      );
    }
    next();
  } catch (error) {
    next(error);
  }
}

// ————— Гарды прав. Вызываются внутри обработчиков и бросают AppError. —————

export function requireUser(req: Request): SessionUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** Пишущие действия: только активные аккаунты (без ограничений/блокировок). */
export function requireActiveUser(req: Request): SessionUser {
  const user = requireUser(req);
  if (user.status === 'banned') {
    throw forbidden('Аккаунт заблокирован. Обратитесь к администрации.');
  }
  if (user.status === 'limited') {
    throw forbidden('Для вашего аккаунта публикация действий временно ограничена.');
  }
  return user;
}

export function requireMod(req: Request): SessionUser {
  const user = requireUser(req);
  if (user.role !== 'admin' && user.role !== 'moderator') {
    throw forbidden('Раздел доступен модераторам и администраторам.');
  }
  return user;
}

export function requireAdmin(req: Request): SessionUser {
  const user = requireUser(req);
  if (user.role !== 'admin') {
    throw forbidden('Раздел доступен только администраторам.');
  }
  return user;
}

// ————— Версии для app.use(): обязаны вызвать next(), иначе запрос «зависает». —————

/** Express-middleware: только администратор, иначе 401/403. */
export function adminOnly(req: Request, _res: Response, next: NextFunction): void {
  try {
    requireAdmin(req);
    next();
  } catch (error) {
    next(error);
  }
}

/** Express-middleware: администратор или модератор. */
export function modOnly(req: Request, _res: Response, next: NextFunction): void {
  try {
    requireMod(req);
    next();
  } catch (error) {
    next(error);
  }
}
