// Маршруты пользователей: публичный профиль, редактирование, подписки, поиск.

import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool';
import { withTransaction } from '../db/sql';
import { attachSession, requireActiveUser, requireUser } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { updateProfileSchema } from '../../shared/schemas';
import {
  getProfile,
  listFollowing,
  searchUsers,
  setFollowing,
  updateProfile,
} from '../services/users';
import { popularTags, searchTags } from '../services/tags';

export const usersRouter: Router = Router();

/** Express 5 типизирует params как string | string[] — приводим к строке. */
function param(req: { params: Record<string, unknown> }, name: string): string {
  const value = req.params[name];
  return typeof value === 'string' ? value : String(value ?? '');
}

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

// ————— Публичный профиль —————

usersRouter.get('/:username', attachSession, async (req, res) => {
  const profile = await getProfile(param(req, 'username'), req.user ?? null, getPool());
  res.json({ profile });
});

// ————— Мои подписки —————

usersRouter.get('/:username/following', attachSession, async (req, res) => {
  const viewer = requireUser(req);
  const profile = await getProfile(param(req, 'username'), viewer, getPool());
  const { page, pageSize } = pageSchema.parse(req.query);

  // Список подписок скрывается настройкой приватности (кроме владельца и модерации).
  const isSelf = viewer.id === profile.id;
  const isMod = viewer.role === 'admin' || viewer.role === 'moderator';
  const showFollowing = isSelf || isMod || profile.counts.following !== null;
  if (!showFollowing) {
    res.json({ items: [], page, pageSize, total: 0, hasMore: false, hidden: true });
    return;
  }

  const result = await listFollowing(profile.id, page, pageSize, getPool());
  res.json({
    items: result.items,
    page,
    pageSize,
    total: result.total,
    hasMore: (page - 1) * pageSize + result.items.length < result.total,
    hidden: false,
  });
});

// ————— Подписка / отписка —————

usersRouter.post(
  '/:username/follow',
  attachSession,
  rateLimit({ name: 'follow', windowMs: 60_000, max: 60 }),
  async (req, res) => {
    const viewer = requireActiveUser(req);
    const body = z.object({ follow: z.boolean().default(true) }).parse(req.body ?? {});
    const result = await withTransaction((db) =>
      setFollowing(viewer.id, param(req, 'username'), body.follow, db),
    );
    res.json(result);
  },
);

usersRouter.delete('/:username/follow', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const result = await withTransaction((db) => setFollowing(viewer.id, param(req, 'username'), false, db));
  res.json(result);
});

// ————— Редактирование профиля —————

usersRouter.patch('/me', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const input = updateProfileSchema.parse(req.body);
  await withTransaction((db) => updateProfile(viewer.id, input, db));
  const row = await import('../services/users').then((m) => m.findUserById(viewer.id));
  const profile = row?.username ? await getProfile(row.username, viewer, getPool()) : null;
  res.json({ profile });
});

// ————— Поиск пользователей (для @упоминаний и людей) —————

usersRouter.get('/search/query', attachSession, async (req, res) => {
  const q = z.string().trim().max(60).parse(req.query.q ?? '');
  if (q.length < 2) {
    res.json({ items: [] });
    return;
  }
  const items = await searchUsers(q, 8, getPool());
  res.json({ items });
});

// ————— Теги: поиск и популярные —————

usersRouter.get('/tags/list', attachSession, async (req, res) => {
  const q = z.string().trim().max(60).parse(req.query.q ?? '');
  if (q.length >= 2) {
    res.json({ items: await searchTags(q, 12) });
    return;
  }
  res.json({ items: await popularTags(24) });
});
