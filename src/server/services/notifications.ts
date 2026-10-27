// Уведомления: создание с учётом настроек, список, счётчик непрочитанных, прочтение.
// Реального времени пока нет — клиент обновляет счётчик периодическими запросами.

import type { Queryable } from '../db/sql';
import { one, query, rows } from '../db/sql';
import { newId } from '../lib/ids';
import { normalizeSettings } from '../../shared/settings';
import type { NotificationDto, NotificationType, Paginated } from '../../shared/types';

export type CreateNotificationParams = {
  userId: string;
  type: NotificationType;
  actorId?: string | null;
  entityType: string;
  entityId: string;
  postId?: string | null;
  payload?: Record<string, unknown>;
};

/** Возвращает id созданного уведомления или null (свой уведомление/отключено/дубль). */
export async function createNotification(
  db: Queryable,
  params: CreateNotificationParams,
): Promise<string | null> {
  const { userId, type, actorId = null, entityType, entityId, postId = null, payload = {} } = params;
  if (actorId && actorId === userId) return null;

  const settingsRow = await one<{ settings: unknown }>('SELECT settings FROM users WHERE id = $1', [userId], db);
  if (!settingsRow) return null;
  const prefs = normalizeSettings(settingsRow.settings);
  if (prefs.notify[type] === false) return null;

  const created = await one<{ id: string }>(
    `INSERT INTO notifications (id, user_id, type, actor_id, entity_type, entity_id, post_id, payload)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8
     WHERE NOT EXISTS (
       SELECT 1 FROM notifications
       WHERE user_id = $2 AND type = $3 AND entity_type = $5 AND entity_id = $6
         AND actor_id IS NOT DISTINCT FROM $4
     )
     RETURNING id`,
    [
      newId(),
      userId,
      type,
      actorId,
      entityType,
      entityId,
      postId,
      JSON.stringify(payload),
    ],
    db,
  );
  return created?.id ?? null;
}

type NotificationRow = {
  id: string;
  type: NotificationType;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  post_id: string | null;
  payload: Record<string, unknown>;
  read_at: Date | string | null;
  created_at: Date | string;
  post_title: string | null;
  actor_username: string | null;
  actor_display_name: string | null;
  actor_role: 'user' | 'moderator' | 'admin' | null;
  actor_level: number | null;
  actor_reputation: number | null;
};

const NOTIFICATION_SELECT = `
  SELECT n.id, n.type, n.actor_id, n.entity_type, n.entity_id, n.post_id, n.payload,
         n.read_at, n.created_at,
         p.title AS post_title,
         u.username AS actor_username, u.display_name AS actor_display_name,
         u.role AS actor_role, u.level AS actor_level, u.reputation AS actor_reputation
  FROM notifications n
  LEFT JOIN posts p ON p.id = n.post_id
  LEFT JOIN users u ON u.id = n.actor_id
`;

function toDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    actor:
      row.actor_id && row.actor_username
        ? {
            id: row.actor_id,
            username: row.actor_username,
            displayName: row.actor_display_name ?? row.actor_username,
            role: row.actor_role ?? 'user',
            level: row.actor_level ?? 1,
            reputation: row.actor_reputation ?? 0,
          }
        : null,
    entityType: row.entity_type,
    entityId: row.entity_id,
    post: row.post_id && row.post_title ? { id: row.post_id, title: row.post_title } : null,
    payload: row.payload ?? {},
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listNotifications(
  userId: string,
  options: { page: number; pageSize: number; unreadOnly: boolean },
): Promise<Paginated<NotificationDto>> {
  const offset = (options.page - 1) * options.pageSize;
  const filter = options.unreadOnly ? 'AND n.read_at IS NULL' : '';
  const [items, totalRow] = await Promise.all([
    rows<NotificationRow>(
      `${NOTIFICATION_SELECT} WHERE n.user_id = $1 ${filter}
       ORDER BY n.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, options.pageSize, offset],
    ),
    one<{ count: string }>(
      `SELECT count(*) AS count FROM notifications n WHERE n.user_id = $1 ${filter}`,
      [userId],
    ),
  ]);
  const total = Number(totalRow?.count ?? 0);
  return {
    items: items.map(toDto),
    page: options.page,
    pageSize: options.pageSize,
    total,
    hasMore: offset + items.length < total,
  };
}

export async function unreadCount(userId: string): Promise<number> {
  const row = await one<{ count: string }>(
    'SELECT count(*) AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return Number(row?.count ?? 0);
}

/**
 * Отмечает уведомления прочитанными.
 * Возвращает новый счётчик непрочитанных уведомлений пользователя.
 */
export async function markNotificationsRead(
  userId: string,
  options: { ids?: string[]; all?: boolean },
): Promise<number> {
  if (options.all) {
    await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
  } else {
    const ids = options.ids ?? [];
    if (ids.length > 0) {
      const placeholders = ids.map((_, index) => `$${index + 2}`).join(', ');
      await query(
        `UPDATE notifications SET read_at = now()
         WHERE user_id = $1 AND read_at IS NULL AND id IN (${placeholders})`,
        [userId, ...ids],
      );
    }
  }
  return unreadCount(userId);
}
