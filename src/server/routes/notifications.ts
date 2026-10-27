// Уведомления: список, счётчик непрочитанных, прочтение, настройки типов.

import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool';
import { withTransaction } from '../db/sql';
import { attachSession, requireActiveUser, requireUser } from '../middleware/auth';
import {
  listNotifications,
  markNotificationsRead,
  unreadCount,
} from '../services/notifications';
import { getProfile, updateProfile } from '../services/users';
import { normalizeSettings } from '../../shared/settings';
import { one } from '../db/sql';

export const notificationsRouter: Router = Router();

notificationsRouter.get('/', attachSession, async (req, res) => {
  const viewer = requireUser(req);
  const query = z
    .object({
      page: z.coerce.number().int().min(1).max(500).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(20),
      unreadOnly: z
        .union([z.literal('true'), z.literal('false'), z.boolean()])
        .transform((value) => value === true || value === 'true')
        .default(false),
    })
    .parse(req.query);

  const [list, unread] = await Promise.all([
    listNotifications(viewer.id, query),
    unreadCount(viewer.id),
  ]);
  res.json({ ...list, unread });
});

notificationsRouter.post('/read', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const input = z
    .object({
      ids: z.array(z.string().max(64)).max(200).optional(),
      all: z.boolean().optional(),
    })
    .parse(req.body ?? {});
  const unread = await withTransaction(() =>
    markNotificationsRead(viewer.id, { ids: input.ids, all: input.all }),
  );
  res.json({ unread });
});

notificationsRouter.get('/unread-count', attachSession, async (req, res) => {
  const viewer = requireUser(req);
  res.json({ unread: await unreadCount(viewer.id) });
});

// ————— Настройки уведомлений (часть профиля) —————

notificationsRouter.get('/settings', attachSession, async (req, res) => {
  const viewer = requireUser(req);
  const row = await one<{ settings: unknown }>('SELECT settings FROM users WHERE id = $1', [
    viewer.id,
  ]);
  res.json({ settings: normalizeSettings(row?.settings) });
});

notificationsRouter.patch('/settings', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const input = z
    .object({ notify: z.record(z.string(), z.boolean()) })
    .parse(req.body);
  await withTransaction((db) => updateProfile(viewer.id, { settings: { notify: input.notify } }, db));
  const row = await one<{ settings: unknown }>('SELECT settings FROM users WHERE id = $1', [
    viewer.id,
  ]);
  res.json({ settings: normalizeSettings(row?.settings) });
});

void getProfile;
void getPool;
