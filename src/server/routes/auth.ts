// Маршруты авторизации: сессия, Google OAuth, тестовый вход (только разработка).

import { Router } from 'express';
import { getPool } from '../db/pool';
import { withTransaction } from '../db/sql';
import { attachSession, requireActiveUser } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import {
  OAUTH_NOT_CONFIGURED_MESSAGE,
  assertGoogleConfigured,
  buildGoogleAuthUrl,
  devLogin,
  endSession,
  handleGoogleCallback,
} from '../services/auth';
import { getXpRules } from '../services/xp';
import { awardXp } from '../services/xp';
import { countDrafts, findUserById, getProfile, setupProfile } from '../services/users';
import { devLoginSchema, setupSchema } from '../../shared/schemas';

export const authRouter: Router = Router();

// ————— Текущая сессия —————

authRouter.get('/session', attachSession, async (req, res) => {
  const user = req.user ?? null;
  const drafts = user ? await countDrafts(user.id) : 0;
  res.json({ user, drafts });
});

// ————— Текущий профиль —————

authRouter.get('/me', attachSession, async (req, res) => {
  const user = req.user ?? null;
  if (!user) {
    res.json({ user: null, profile: null });
    return;
  }
  const row = await findUserById(user.id);
  if (!row?.username) {
    res.json({ user, profile: null });
    return;
  }
  const profile = await getProfile(row.username, user, getPool());
  res.json({ user, profile });
});

// ————— Тестовый вход (разработка) —————

authRouter.post(
  '/dev-login',
  rateLimit({ name: 'dev-login', windowMs: 60_000, max: 20 }),
  async (req, res) => {
    const input = devLoginSchema.parse(req.body);
    const user = await devLogin(req, res, input.username);
    res.json({ user });
  },
);

// ————— Первичная настройка профиля —————

authRouter.post('/setup', attachSession, async (req, res) => {
  const current = requireActiveUser(req);
  const input = setupSchema.parse(req.body);

  const username = await withTransaction(async (db) => {
    const result = await setupProfile(current.id, input, db);
    const rules = await getXpRules(db);
    await awardXp(db, {
      userId: current.id,
      kind: 'profile_setup',
      xp: rules.profile_setup ?? 5,
      reason: 'Настройка профиля',
      sourceType: 'user',
      sourceId: current.id,
    });
    return result.username;
  });

  const profile = await getProfile(username, current, getPool());
  const user = await findUserById(current.id);
  res.json({ user: user ? { ...current, username, onboarded: true } : current, profile });
});

// ————— Выход —————

authRouter.post('/logout', attachSession, async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});

// ————— Google OAuth —————

/** Состояние авторизации для экрана входа (секреты не отдаются). */
authRouter.get('/google/status', (_req, res) => {
  let configured = false;
  try {
    assertGoogleConfigured();
    configured = true;
  } catch {
    configured = false;
  }
  res.json({ configured, message: configured ? null : OAUTH_NOT_CONFIGURED_MESSAGE });
});

authRouter.get('/google', attachSession, (req, res) => {
  try {
    res.redirect(buildGoogleAuthUrl(req, res));
  } catch {
    res.status(503).json({
      error: { code: 'oauth_not_configured', message: OAUTH_NOT_CONFIGURED_MESSAGE },
    });
  }
});

authRouter.get('/google/callback', attachSession, async (req, res, next) => {
  try {
    await handleGoogleCallback(req, res);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'oauth_not_configured'
    ) {
      res.status(503).json({
        error: { code: 'oauth_not_configured', message: OAUTH_NOT_CONFIGURED_MESSAGE },
      });
      return;
    }
    next(error);
  }
});
