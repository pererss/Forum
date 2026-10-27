// Жизненный цикл сессий и входы. Google OAuth реализован по существу,
// но включается только после заполнения GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../env';
import { one } from '../db/sql';
import { badRequest, serviceUnavailable } from '../lib/errors';
import { newId } from '../lib/ids';
import { serializeCookie } from '../lib/cookies';
import { SESSION_COOKIE, hashToken, toSessionUser } from '../middleware/auth';
import { defaultUserSettings } from '../../shared/settings';
import type { SessionUser } from '../../shared/types';
import { isValidUsername, normalizeUsername } from '../../shared/slug';

const OAUTH_STATE_COOKIE = 'nuffy_oauth_state';

export const OAUTH_NOT_CONFIGURED_MESSAGE =
  'Авторизация через Google ещё не настроена. Добавьте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в .env.local — инструкция в README.';

function sessionTtlSeconds(): number {
  return Math.max(1, env.sessionTtlDays) * 86_400;
}

export async function startSession(
  res: Response,
  userId: string,
  userAgent: string | undefined,
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const ttl = sessionTtlSeconds();
  await one(
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [newId(), userId, hashToken(token), (userAgent ?? '').slice(0, 300) || null, new Date(Date.now() + ttl * 1000)],
  );
  res.append(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProd,
      maxAgeSeconds: ttl,
    }),
  );
}

export async function endSession(req: Request, res: Response): Promise<void> {
  if (req.sessionToken) {
    await one('DELETE FROM sessions WHERE token_hash = $1', [hashToken(req.sessionToken)]).catch(() => {});
  }
  res.append('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAgeSeconds: 0 }));
}

export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const row = await one<Parameters<typeof toSessionUser>[0]>(
    `SELECT '' AS session_id, now() AS expires_at, now() AS last_seen_at, u.*
     FROM users u WHERE u.id = $1`,
    [userId],
  );
  return row ? toSessionUser(row) : null;
}

/**
 * Тестовый вход для разработки: создаёт или находит пользователя по username.
 * Работает ТОЛЬКО когда ENABLE_DEV_LOGIN=true и NODE_ENV !== 'production'.
 */
export async function devLogin(
  req: Request,
  res: Response,
  usernameInput: string,
): Promise<SessionUser> {
  if (!env.devLoginEnabled) {
    throw serviceUnavailable(
      'Тестовый вход отключён. Он доступен только в режиме разработки при ENABLE_DEV_LOGIN=true.',
      'dev_login_disabled',
    );
  }

  const lower = normalizeUsername(usernameInput);
  if (!isValidUsername(lower)) {
    throw badRequest('Некорректное имя пользователя.', {
      username: ['3–24 символа: буквы, цифры, точка, дефис, подчёркивание.'],
    });
  }

  let user = await one<{ id: string; username: string | null }>(
    'SELECT id, username FROM users WHERE username_lower = $1',
    [lower],
  );

  if (!user) {
    const id = newId();
    const created = await one<{ id: string }>(
      `INSERT INTO users (id, username, username_lower, display_name, settings, onboarded_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (username_lower) DO UPDATE SET username_lower = users.username_lower
       RETURNING id`,
      [id, lower, lower, lower, JSON.stringify(defaultUserSettings())],
    );
    user = { id: created!.id, username: lower };
  }

  await startSession(res, user.id, req.headers['user-agent']);
  const sessionUser = await loadSessionUser(user.id);
  if (!sessionUser) throw badRequest('Не удалось создать сессию.');
  return sessionUser;
}

// ————— Google OAuth —————

function googleRedirectUri(req: Request): string {
  const override = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (override) return override;
  const host = req.headers.host ?? `localhost:${env.port}`;
  return `${req.protocol}://${host}/api/auth/google/callback`;
}

export function assertGoogleConfigured(): void {
  if (!env.google.configured) throw serviceUnavailable(OAUTH_NOT_CONFIGURED_MESSAGE, 'oauth_not_configured');
}

/** Формирует URL авторизации Google с одноразовым state. */
export function buildGoogleAuthUrl(req: Request, res: Response): string {
  assertGoogleConfigured();
  const state = randomBytes(16).toString('base64url');
  res.append(
    'Set-Cookie',
    serializeCookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProd,
      maxAgeSeconds: 600,
    }),
  );
  const params = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: googleRedirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type GoogleProfile = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

async function exchangeGoogleCode(req: Request, code: string): Promise<GoogleProfile> {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: googleRedirectUri(req),
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenResponse.ok) throw badRequest('Не удалось подтвердить вход через Google (обмен кодом).');
  const tokens = (await tokenResponse.json()) as { access_token?: string };
  if (!tokens.access_token) throw badRequest('Google не вернул токен доступа.');

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileResponse.ok) throw badRequest('Не удалось получить данные профиля Google.');
  return (await profileResponse.json()) as GoogleProfile;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Обработчик callback. Повторный вход с тем же аккаунтом открывает существующий профиль
 * (по google_sub, затем по подтверждённому email). Новый пользователь получает username
 * на экране первоначальной настройки.
 */
export async function handleGoogleCallback(req: Request, res: Response): Promise<void> {
  assertGoogleConfigured();

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const stateCookie = parseStateCookie(req);
  if (!code || !state || !stateCookie || !safeEqual(state, stateCookie)) {
    throw badRequest('Недействительный запрос авторизации. Попробуйте ещё раз.');
  }

  const profile = await exchangeGoogleCode(req, code);
  if (!profile.sub) throw badRequest('Некорректный ответ от Google.');

  let user = await one<{ id: string; username: string | null }>(
    'SELECT id, username FROM users WHERE google_sub = $1',
    [profile.sub],
  );

  if (!user && profile.email && profile.email_verified) {
    const byEmail = await one<{ id: string; username: string | null }>(
      'SELECT id, username FROM users WHERE email = $1',
      [profile.email],
    );
    if (byEmail) {
      await one('UPDATE users SET google_sub = $1, email_verified = true, updated_at = now() WHERE id = $2', [
        profile.sub,
        byEmail.id,
      ]);
      user = byEmail;
    }
  }

  if (!user) {
    const id = newId();
    const displayName = (profile.name ?? profile.email ?? 'Пользователь').slice(0, 60);
    const created = await one<{ id: string }>(
      `INSERT INTO users (id, google_sub, email, email_verified, display_name, settings)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        id,
        profile.sub,
        profile.email?.toLowerCase() ?? null,
        Boolean(profile.email_verified),
        displayName,
        JSON.stringify(defaultUserSettings()),
      ],
    );
    user = { id: created!.id, username: null };
  }

  // Первый администратор назначается по ADMIN_EMAILS из окружения сервера.
  if (profile.email && env.adminEmails.includes(profile.email.toLowerCase())) {
    await one(
      `UPDATE users SET role = 'admin', status = 'active', updated_at = now()
       WHERE id = $1 AND role <> 'admin'`,
      [user.id],
    );
  }

  await startSession(res, user.id, req.headers['user-agent']);
  res.redirect(user.username ? '/' : '/setup?welcome=1');
}

function parseStateCookie(req: Request): string | null {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === OAUTH_STATE_COOKIE) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}
