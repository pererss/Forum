// Административная панель: все разделы защищены requireAdmin на серверной стороне.
// Каждая операция реально меняет данные и пишется в admin_logs.

import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool';
import { one, query, rows, withTransaction } from '../db/sql';
import { badRequest, conflict, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { adminOnly, attachSession, modOnly, requireAdmin } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { invalidateSettingsCache, listSettings, setSetting } from '../services/platform-settings';
import {
  awardXp,
  computeLevelProgress,
  getLevelProgress,
  getLevelThresholds,
  getXpRules,
  listAchievements,
} from '../services/xp';
import { dbState } from '../db/ready';
import { env, describeDatabase } from '../env';
import { pingDatabase } from '../db/pool';

export const adminRouter: Router = Router();

adminRouter.use(attachSession, adminOnly);

function param(req: { params: Record<string, unknown> }, name: string): string {
  const value = req.params[name];
  return typeof value === 'string' ? value : String(value ?? '');
}

async function logAdmin(
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO admin_logs (id, admin_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [newId(), adminId, action, targetType, targetId, JSON.stringify(details)],
  ).catch((error) => {
    console.error('[admin] не удалось записать журнал:', error instanceof Error ? error.message : '');
  });
}

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
});

// ————— 1. Обзор —————

adminRouter.get('/stats', async (_req, res) => {
  const [users, posts, comments, activeProjects, openReports, banned, drafts, xpEvents] =
    await Promise.all([
      one<{ count: string }>('SELECT count(*) AS count FROM users'),
      one<{ count: string }>("SELECT count(*) AS count FROM posts WHERE status = 'published'"),
      one<{ count: string }>("SELECT count(*) AS count FROM comments WHERE status = 'visible'"),
      one<{ count: string }>(
        "SELECT count(*) AS count FROM posts WHERE type = 'team' AND status = 'published' AND expires_at > now()",
      ),
      one<{ count: string }>("SELECT count(*) AS count FROM reports WHERE status = 'open'"),
      one<{ count: string }>("SELECT count(*) AS count FROM users WHERE status = 'banned'"),
      one<{ count: string }>("SELECT count(*) AS count FROM posts WHERE status = 'draft'"),
      one<{ count: string }>('SELECT count(*) AS count FROM progress_events'),
    ]);

  const recent = await rows<{ day: string; posts: string; comments: string }>(
    `SELECT to_char(date_trunc('day', d.day), 'YYYY-MM-DD') AS day,
            COALESCE(p.cnt, 0) AS posts, COALESCE(c.cnt, 0) AS comments
     FROM (
       SELECT generate_series(date_trunc('day', now()) - interval '6 days',
                              date_trunc('day', now()), interval '1 day') AS day
     ) d
     LEFT JOIN (
       SELECT date_trunc('day', created_at) AS day, count(*) AS cnt
       FROM posts WHERE status = 'published' GROUP BY 1
     ) p ON p.day = d.day
     LEFT JOIN (
       SELECT date_trunc('day', created_at) AS day, count(*) AS cnt
       FROM comments WHERE status = 'visible' GROUP BY 1
     ) c ON c.day = d.day
     ORDER BY d.day`,
  ).catch(() => [] as { day: string; posts: string; comments: string }[]);

  res.json({
    users: Number(users?.count ?? 0),
    posts: Number(posts?.count ?? 0),
    comments: Number(comments?.count ?? 0),
    activeProjects: Number(activeProjects?.count ?? 0),
    openReports: Number(openReports?.count ?? 0),
    banned: Number(banned?.count ?? 0),
    drafts: Number(drafts?.count ?? 0),
    xpEvents: Number(xpEvents?.count ?? 0),
    recent: recent.map((row) => ({
      day: row.day,
      posts: Number(row.posts),
      comments: Number(row.comments),
    })),
  });
});

// ————— 2. Пользователи —————

adminRouter.get('/users', async (req, res) => {
  const query_ = pageQuery.parse(req.query);
  const offset = (query_.page - 1) * query_.pageSize;
  const q = query_.q ? `%${query_.q}%` : null;

  const where = q ? 'WHERE u.username_lower LIKE $3 OR u.display_name ILIKE $3 OR u.email ILIKE $3' : '';
  const params = q
    ? [query_.pageSize, offset, q.toLowerCase().startsWith('%') ? q : `%${q}%`]
    : [query_.pageSize, offset];

  const [items, totalRow] = await Promise.all([
    rows<{
      id: string;
      username: string | null;
      display_name: string;
      email: string | null;
      role: string;
      status: string;
      xp: number;
      reputation: number;
      level: number;
      post_count: string;
      created_at: Date;
    }>(
      `SELECT u.id, u.username, u.display_name, u.email, u.role, u.status,
              u.xp, u.reputation, u.level, u.created_at,
              (SELECT count(*) FROM posts p WHERE p.author_id = u.id AND p.status = 'published') AS post_count
       FROM users u
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    ),
    one<{ count: string }>(
      `SELECT count(*) AS count FROM users u ${where}`,
      q ? [q.toLowerCase().startsWith('%') ? q : `%${q}%`] : [],
    ),
  ]);

  res.json({
    items: items.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      role: row.role,
      status: row.status,
      xp: row.xp,
      reputation: row.reputation,
      level: row.level,
      postCount: Number(row.post_count),
      createdAt: new Date(row.created_at).toISOString(),
    })),
    page: query_.page,
    pageSize: query_.pageSize,
    total: Number(totalRow?.count ?? 0),
    hasMore: offset + items.length < Number(totalRow?.count ?? 0),
  });
});

adminRouter.patch('/users/:id', async (req, res) => {
  const admin = requireAdmin(req);
  const id = param(req, 'id');
  const input = z
    .object({
      role: z.enum(['user', 'moderator', 'admin']).optional(),
      status: z.enum(['active', 'limited', 'banned']).optional(),
    })
    .parse(req.body);

  if (!input.role && !input.status) throw badRequest('Нечего изменять.');
  if (id === admin.id && input.status === 'banned') throw conflict('Нельзя заблокировать самого себя.');
  if (id === admin.id && input.role && input.role !== 'admin') {
    throw conflict('Нельзя понизить собственную роль.');
  }

  const target = await one<{ id: string; role: string; username: string | null }>(
    'SELECT id, role, username FROM users WHERE id = $1',
    [id],
  );
  if (!target) throw notFound('Пользователь не найден.');
  if (target.role === 'admin' && input.role && input.role !== 'admin') {
    // Понижение другого админа разрешено, но логируется явно.
  }

  await query(
    `UPDATE users SET
       role = COALESCE($2, role),
       status = COALESCE($3, status),
       updated_at = now()
     WHERE id = $1`,
    [id, input.role ?? null, input.status ?? null],
  );
  await logAdmin(admin.id, 'user_update', 'user', id, { ...input, username: target.username });
  res.json({ ok: true });
});

// ————— 3. Публикации —————

adminRouter.get('/posts', async (req, res) => {
  const q_ = pageQuery.parse(req.query);
  const status = z
    .enum(['draft', 'published', 'hidden', 'removed'])
    .optional()
    .parse(req.query.status);
  const type = z.string().max(30).optional().parse(req.query.type);

  const conditions: string[] = [];
  const params: unknown[] = [q_.pageSize, (q_.page - 1) * q_.pageSize];
  if (q_.q) {
    params.push(`%${q_.q}%`);
    conditions.push(`(p.title ILIKE $${params.length} OR p.excerpt ILIKE $${params.length})`);
  }
  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }
  if (type) {
    params.push(type);
    conditions.push(`p.type = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countParams = params.slice(2);
  const [items, totalRow] = await Promise.all([
    rows<{
      id: string;
      type: string;
      title: string;
      status: string;
      author_username: string | null;
      author_display_name: string;
      comment_count: number;
      reaction_score: number;
      created_at: Date;
      published_at: Date | null;
    }>(
      `SELECT p.id, p.type, p.title, p.status, p.comment_count, p.reaction_score,
              p.created_at, p.published_at,
              u.username AS author_username, u.display_name AS author_display_name
       FROM posts p JOIN users u ON u.id = p.author_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    ),
    one<{ count: string }>(
      `SELECT count(*) AS count FROM posts p ${where}`,
      countParams,
    ),
  ]);

  res.json({
    items: items.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      status: row.status,
      author: { username: row.author_username, displayName: row.author_display_name },
      commentCount: row.comment_count,
      reactionScore: row.reaction_score,
      createdAt: new Date(row.created_at).toISOString(),
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    })),
    page: q_.page,
    pageSize: q_.pageSize,
    total: Number(totalRow?.count ?? 0),
    hasMore: (q_.page - 1) * q_.pageSize + items.length < Number(totalRow?.count ?? 0),
  });
});

adminRouter.post('/posts/:id/moderate', async (req, res) => {
  const admin = requireAdmin(req);
  const id = param(req, 'id');
  const input = z
    .object({ action: z.enum(['hide', 'restore', 'pin', 'unpin', 'lock', 'unlock', 'remove']) })
    .parse(req.body);

  const post = await one<{ id: string; status: string }>('SELECT id, status FROM posts WHERE id = $1', [id]);
  if (!post) throw notFound('Публикация не найдена.');

  const updates: Record<string, string> = {
    hide: "status = 'hidden'",
    restore: "status = 'published', published_at = COALESCE(published_at, now())",
    remove: "status = 'removed'",
    pin: 'is_pinned = true',
    unpin: 'is_pinned = false',
    lock: 'is_locked = true',
    unlock: 'is_locked = false',
  };
  await query(`UPDATE posts SET ${updates[input.action]}, updated_at = now() WHERE id = $1`, [id]);
  await logAdmin(admin.id, `post_${input.action}`, 'post', id, { title: post.id });
  res.json({ ok: true, action: input.action });
});

// ————— 4. Комментарии —————

adminRouter.get('/comments', async (req, res) => {
  const q_ = pageQuery.parse(req.query);
  const offset = (q_.page - 1) * q_.pageSize;
  const params: unknown[] = [q_.pageSize, offset];
  let where = '';
  if (q_.q) {
    params.push(`%${q_.q}%`);
    where = `WHERE c.body ILIKE $3`;
  }

  const [items, totalRow] = await Promise.all([
    rows<{
      id: string;
      body: string;
      status: string;
      reaction_score: number;
      created_at: Date;
      author_username: string | null;
      author_display_name: string;
      post_title: string;
      post_id: string;
    }>(
      `SELECT c.id, c.body, c.status, c.reaction_score, c.created_at, c.post_id,
              u.username AS author_username, u.display_name AS author_display_name,
              p.title AS post_title
       FROM comments c
       JOIN users u ON u.id = c.author_id
       JOIN posts p ON p.id = c.post_id
       ${where}
       ORDER BY c.created_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    ),
    one<{ count: string }>(
      `SELECT count(*) AS count FROM comments c ${where}`,
      q_.q ? [`%${q_.q}%`] : [],
    ),
  ]);

  res.json({
    items: items.map((row) => ({
      id: row.id,
      body: row.body.slice(0, 500),
      status: row.status,
      reactionScore: row.reaction_score,
      createdAt: new Date(row.created_at).toISOString(),
      author: { username: row.author_username, displayName: row.author_display_name },
      post: { id: row.post_id, title: row.post_title },
    })),
    page: q_.page,
    pageSize: q_.pageSize,
    total: Number(totalRow?.count ?? 0),
    hasMore: offset + items.length < Number(totalRow?.count ?? 0),
  });
});

adminRouter.post('/comments/:id/moderate', async (req, res) => {
  const admin = requireAdmin(req);
  const id = param(req, 'id');
  const input = z.object({ action: z.enum(['hide', 'restore', 'remove']) }).parse(req.body);

  const comment = await one<{ id: string; post_id: string }>(
    'SELECT id, post_id FROM comments WHERE id = $1',
    [id],
  );
  if (!comment) throw notFound('Комментарий не найден.');

  const statusMap = { hide: 'hidden', restore: 'visible', remove: 'removed' } as const;
  await withTransaction(async (tx) => {
    await tx.query('UPDATE comments SET status = $2, updated_at = now() WHERE id = $1', [
      id,
      statusMap[input.action],
    ]);
    const count = await one<{ count: string }>(
      "SELECT count(*) AS count FROM comments WHERE post_id = $1 AND status = 'visible'",
      [comment.post_id],
      tx,
    );
    await tx.query('UPDATE posts SET comment_count = $2 WHERE id = $1', [
      comment.post_id,
      Number(count?.count ?? 0),
    ]);
  });
  await logAdmin(admin.id, `comment_${input.action}`, 'comment', id, {});
  res.json({ ok: true, action: input.action });
});

// ————— 5. Категории и теги —————

adminRouter.get('/categories', async (_req, res) => {
  const items = await rows(
    `SELECT id, slug, name, description, color, sort_order, is_active,
            (SELECT count(*) FROM posts p WHERE p.category_id = categories.id) AS post_count
     FROM categories ORDER BY sort_order, name`,
  );
  res.json({ items });
});

adminRouter.post('/categories', async (req, res) => {
  const admin = requireAdmin(req);
  const input = z
    .object({
      name: z.string().trim().min(2).max(60),
      slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/i, 'Только буквы, цифры и дефис.'),
      description: z.string().trim().max(300).optional(),
      color: z.string().trim().max(30).default('slate'),
    })
    .parse(req.body);

  const existing = await one('SELECT id FROM categories WHERE slug = $1', [input.slug.toLowerCase()]);
  if (existing) throw conflict('Категория с таким slug уже есть.');
  const id = newId();
  await query(
    `INSERT INTO categories (id, slug, name, description, color)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, input.slug.toLowerCase(), input.name, input.description ?? null, input.color],
  );
  await logAdmin(admin.id, 'category_create', 'category', id, { name: input.name });
  res.status(201).json({ id });
});

adminRouter.patch('/categories/:id', async (req, res) => {
  const admin = requireAdmin(req);
  const id = param(req, 'id');
  const input = z
    .object({
      name: z.string().trim().min(2).max(60).optional(),
      description: z.string().trim().max(300).nullish(),
      color: z.string().trim().max(30).optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().min(0).max(1000).optional(),
    })
    .parse(req.body);

  const sets: string[] = [];
  const params: unknown[] = [id];
  const push = (col: string, value: unknown) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  };
  if (input.name !== undefined) push('name', input.name);
  if (input.description !== undefined) push('description', input.description);
  if (input.color !== undefined) push('color', input.color);
  if (input.isActive !== undefined) push('is_active', input.isActive);
  if (input.sortOrder !== undefined) push('sort_order', input.sortOrder);
  if (sets.length === 0) throw badRequest('Нечего изменять.');

  const updated = await one(
    `UPDATE categories SET ${sets.join(', ')} WHERE id = $1 RETURNING id`,
    params,
  );
  if (!updated) throw notFound('Категория не найдена.');
  await logAdmin(admin.id, 'category_update', 'category', id, { ...input });
  res.json({ ok: true });
});

adminRouter.delete('/categories/:id', async (req, res) => {
  const admin = requireAdmin(req);
  const id = param(req, 'id');
  const used = await one<{ count: string }>(
    'SELECT count(*) AS count FROM posts WHERE category_id = $1',
    [id],
  );
  if (Number(used?.count ?? 0) > 0) {
    // Не удаляем — у публикаций есть ссылки; деактивируем вместо удаления.
    await query('UPDATE categories SET is_active = false WHERE id = $1', [id]);
    await logAdmin(admin.id, 'category_deactivate', 'category', id, {});
    res.json({ ok: true, deactivated: true });
    return;
  }
  await query('DELETE FROM categories WHERE id = $1', [id]);
  await logAdmin(admin.id, 'category_delete', 'category', id, {});
  res.json({ ok: true, deactivated: false });
});

adminRouter.get('/tags', async (req, res) => {
  const q_ = pageQuery.parse(req.query);
  const offset = (q_.page - 1) * q_.pageSize;
  const params: unknown[] = [q_.pageSize, offset];
  let where = '';
  if (q_.q) {
    params.push(`%${q_.q}%`);
    where = 'WHERE slug ILIKE $3 OR name ILIKE $3';
  }
  const [items, totalRow] = await Promise.all([
    rows<{ id: string; slug: string; name: string; usage_count: number; is_active: boolean }>(
      `SELECT id, slug, name, usage_count, is_active FROM tags ${where}
       ORDER BY usage_count DESC, name LIMIT $1 OFFSET $2`,
      params,
    ),
    one<{ count: string }>(`SELECT count(*) AS count FROM tags ${where}`, q_.q ? [`%${q_.q}%`] : []),
  ]);
  res.json({
    items,
    page: q_.page,
    pageSize: q_.pageSize,
    total: Number(totalRow?.count ?? 0),
    hasMore: offset + items.length < Number(totalRow?.count ?? 0),
  });
});

adminRouter.patch('/tags/:id', async (req, res) => {
  const admin = requireAdmin(req);
  const id = param(req, 'id');
  const input = z.object({ isActive: z.boolean(), name: z.string().trim().min(2).max(40).optional() }).parse(req.body);
  const sets = ['is_active = $2'];
  const params: unknown[] = [id, input.isActive];
  if (input.name) {
    params.push(input.name);
    sets.push(`name = $${params.length}`);
  }
  const updated = await one(`UPDATE tags SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, params);
  if (!updated) throw notFound('Тег не найден.');
  await logAdmin(admin.id, 'tag_update', 'tag', id, { ...input });
  res.json({ ok: true });
});

// ————— 6. Типы публикаций —————

adminRouter.get('/post-types', async (_req, res) => {
  const items = await rows(
    'SELECT type, name, description, icon, color, is_enabled, sort_order FROM post_type_settings ORDER BY sort_order, name',
  );
  res.json({ items });
});

adminRouter.patch('/post-types/:type', async (req, res) => {
  const admin = requireAdmin(req);
  const type = param(req, 'type');
  const input = z
    .object({ isEnabled: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100).optional() })
    .parse(req.body);

  const updated = await one(
    `UPDATE post_type_settings
     SET is_enabled = COALESCE($2, is_enabled),
         sort_order = COALESCE($3, sort_order),
         updated_at = now()
     WHERE type = $1 RETURNING type`,
    [type, input.isEnabled ?? null, input.sortOrder ?? null],
  );
  if (!updated) throw notFound('Тип не найден.');
  await logAdmin(admin.id, 'post_type_update', 'post_type', type, { ...input });
  res.json({ ok: true });
});

// ————— 7. XP, уровни, достижения —————

adminRouter.get('/progress', async (_req, res) => {
  const [rules, thresholds, achievements] = await Promise.all([
    getXpRules(),
    getLevelThresholds(),
    listAchievements(),
  ]);
  res.json({ rules, thresholds, achievements });
});

adminRouter.put('/progress/rules', async (req, res) => {
  const admin = requireAdmin(req);
  const input = z.record(z.string(), z.number().int().min(0).max(10_000)).parse(req.body);
  const current = await getXpRules();
  const merged = { ...current };
  for (const [key, value] of Object.entries(input)) {
    if (key in current) merged[key] = value;
    else throw badRequest(`Неизвестное правило: ${key}`);
  }
  await setSetting('xp_rules', merged, 'Правила начисления опыта', admin.id);
  await logAdmin(admin.id, 'xp_rules_update', 'setting', 'xp_rules', { changed: Object.keys(input) });
  res.json({ rules: merged });
});

adminRouter.put('/progress/thresholds', async (req, res) => {
  const admin = requireAdmin(req);
  const input = z
    .array(z.object({ level: z.number().int().min(1).max(200), xp: z.number().int().min(0).max(100_000_000) }))
    .min(2)
    .max(200)
    .parse(req.body);

  const sorted = [...input].sort((a, b) => a.level - b.level);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.xp <= sorted[i - 1]!.xp) throw badRequest('Пороги опыта должны возрастать.');
  }
  await setSetting('level_thresholds', sorted, 'Пороги уровней', admin.id);
  await logAdmin(admin.id, 'thresholds_update', 'setting', 'level_thresholds', { levels: sorted.length });
  res.json({ thresholds: sorted });
});

adminRouter.post('/progress/achievements', async (req, res) => {
  const admin = requireAdmin(req);
  const input = z
    .object({
      slug: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/i),
      name: z.string().trim().min(2).max(60),
      description: z.string().trim().max(300).default(''),
      icon: z.string().trim().max(40).default('sparkles'),
      color: z.string().trim().max(30).default('accent'),
    })
    .parse(req.body);

  const id = newId();
  const created = await one<{ id: string }>(
    `INSERT INTO achievements (id, slug, name, description, icon, color)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
     RETURNING id`,
    [id, input.slug.toLowerCase(), input.name, input.description, input.icon, input.color],
  );
  await logAdmin(admin.id, 'achievement_upsert', 'achievement', created?.id ?? input.slug, { ...input });
  res.status(201).json({ id: created?.id });
});

adminRouter.delete('/achievements/:id', async (req, res) => {
  const admin = requireAdmin(req);
  const id = param(req, 'id');
  const updated = await one(
    'UPDATE achievements SET is_active = false WHERE id = $1 RETURNING id',
    [id],
  );
  if (!updated) throw notFound('Достижение не найдено.');
  await logAdmin(admin.id, 'achievement_deactivate', 'achievement', id, {});
  res.json({ ok: true });
});

adminRouter.post('/users/:id/xp', async (req, res) => {
  const admin = requireAdmin(req);
  const id = param(req, 'id');
  const input = z
    .object({
      xp: z.number().int().min(-10_000).max(10_000),
      reason: z.string().trim().min(3).max(200),
    })
    .parse(req.body);

  const target = await one<{ id: string }>('SELECT id FROM users WHERE id = $1', [id]);
  if (!target) throw notFound('Пользователь не найден.');

  // Ручные корректировки: source = admin:<log-id>, чтобы не пересекаться с событиями.
  await awardXp(getPool(), {
    userId: id,
    kind: 'admin_adjustment',
    xp: input.xp,
    reason: input.reason,
    sourceType: 'admin',
    sourceId: newId(),
    actorId: admin.id,
  });
  await logAdmin(admin.id, 'xp_adjust', 'user', id, { xp: input.xp, reason: input.reason });
  const row = await one<{ xp: number; level: number; reputation: number }>(
    'SELECT xp, level, reputation FROM users WHERE id = $1',
    [id],
  );
  res.json({ ok: true, user: row });
});

// ————— 8. Модерация и жалобы —————

adminRouter.get('/reports', async (req, res) => {
  const q_ = pageQuery.parse(req.query);
  const status = z.enum(['open', 'resolved', 'rejected']).optional().parse(req.query.status);
  const offset = (q_.page - 1) * q_.pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [q_.pageSize, offset];
  if (status) {
    params.push(status);
    conditions.push(`r.status = $${params.length}`);
  }
  if (q_.q) {
    params.push(`%${q_.q}%`);
    conditions.push(`r.reason ILIKE $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [items, totalRow] = await Promise.all([
    rows<{
      id: string;
      target_type: string;
      target_id: string;
      reason: string;
      details: string | null;
      status: string;
      created_at: Date;
      reporter_username: string | null;
      reporter_display_name: string;
      target_preview: string | null;
    }>(
      `SELECT r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.created_at,
              u.username AS reporter_username, u.display_name AS reporter_display_name,
              CASE r.target_type
                WHEN 'post' THEN (SELECT title FROM posts WHERE id = r.target_id)
                WHEN 'comment' THEN (SELECT left(body, 160) FROM comments WHERE id = r.target_id)
                ELSE (SELECT display_name FROM users WHERE id = r.target_id)
              END AS target_preview
       FROM reports r JOIN users u ON u.id = r.reporter_id
       ${where}
       ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.created_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    ),
    one<{ count: string }>(`SELECT count(*) AS count FROM reports r ${where}`, params.slice(2)),
  ]);

  res.json({
    items: items.map((row) => ({
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      reason: row.reason,
      details: row.details,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      reporter: { username: row.reporter_username, displayName: row.reporter_display_name },
      targetPreview: row.target_preview,
    })),
    page: q_.page,
    pageSize: q_.pageSize,
    total: Number(totalRow?.count ?? 0),
    hasMore: offset + items.length < Number(totalRow?.count ?? 0),
  });
});

adminRouter.post('/reports/:id/resolve', async (req, res) => {
  const admin = requireAdmin(req);
  const id = param(req, 'id');
  const input = z
    .object({ status: z.enum(['resolved', 'rejected']), note: z.string().trim().max(500).optional() })
    .parse(req.body);

  const updated = await one(
    `UPDATE reports SET status = $2, handled_by = $3, handled_at = now(), resolution_note = $4
     WHERE id = $1 AND status = 'open' RETURNING id`,
    [id, input.status, admin.id, input.note ?? null],
  );
  if (!updated) throw conflict('Жалоба уже обработана или не найдена.');
  await logAdmin(admin.id, `report_${input.status}`, 'report', id, { note: input.note });
  res.json({ ok: true });
});

// ————— 9. Настройки платформы —————

adminRouter.get('/settings', async (_req, res) => {
  const items = await listSettings();
  res.json({ items });
});

adminRouter.put('/settings/:key', async (req, res) => {
  const admin = requireAdmin(req);
  const key = param(req, 'key');
  if (!/^[a-z0-9_]{2,60}$/.test(key)) throw badRequest('Недопустимый ключ настройки.');
  const value = z.unknown().parse(req.body?.value);
  await setSetting(key, value, String(req.body?.description ?? ''), admin.id);
  invalidateSettingsCache();
  await logAdmin(admin.id, 'setting_update', 'setting', key, {});
  res.json({ ok: true });
});

// ————— 10. Журнал действий —————

adminRouter.get('/logs', async (req, res) => {
  const q_ = pageQuery.parse(req.query);
  const offset = (q_.page - 1) * q_.pageSize;
  const params: unknown[] = [q_.pageSize, offset];
  let where = '';
  if (q_.q) {
    params.push(`%${q_.q}%`);
    where = 'WHERE l.action ILIKE $3';
  }
  const [items, totalRow] = await Promise.all([
    rows<{
      id: string;
      action: string;
      target_type: string | null;
      target_id: string | null;
      details: unknown;
      created_at: Date;
      admin_username: string | null;
      admin_display_name: string;
    }>(
      `SELECT l.id, l.action, l.target_type, l.target_id, l.details, l.created_at,
              u.username AS admin_username, u.display_name AS admin_display_name
       FROM admin_logs l JOIN users u ON u.id = l.admin_id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    ),
    one<{ count: string }>(`SELECT count(*) AS count FROM admin_logs l ${where}`, q_.q ? [`%${q_.q}%`] : []),
  ]);
  res.json({
    items: items.map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details,
      createdAt: new Date(row.created_at).toISOString(),
      admin: { username: row.admin_username, displayName: row.admin_display_name },
    })),
    page: q_.page,
    pageSize: q_.pageSize,
    total: Number(totalRow?.count ?? 0),
    hasMore: offset + items.length < Number(totalRow?.count ?? 0),
  });
});

// ————— 11. Диагностика (без секретов) —————

adminRouter.get('/diagnostics', async (_req, res) => {
  const db = await pingDatabase();
  const migrations = await rows<{ id: string; applied_at: Date }>(
    'SELECT id, applied_at FROM _migrations ORDER BY id',
  ).catch(() => []);
  const tableCount = await one<{ count: string }>(
    "SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'",
  );

  res.json({
    node: { version: process.version, env: env.isProd ? 'production' : 'development', uptimeSec: Math.round(process.uptime()) },
    database: {
      // Маскированное описание: без логина, пароля и строки подключения.
      target: describeDatabase(),
      ready: db.ok,
      latencyMs: db.latencyMs ?? null,
      error: db.ok ? null : (db.error ?? 'ошибка подключения').slice(0, 200),
      schema: env.databaseSchema,
      tables: Number(tableCount?.count ?? 0),
      migrations: migrations.map((row) => ({
        id: row.id,
        appliedAt: new Date(row.applied_at).toISOString(),
      })),
      bootState: { ready: dbState().ready, code: dbState().code },
    },
    auth: {
      googleConfigured: env.google.configured,
      devLoginEnabled: env.devLoginEnabled,
      adminEmailsCount: env.adminEmails.length,
    },
    rateLimit: { scale: Number(process.env.RATE_LIMIT_SCALE ?? 1) },
  });
});

// ————— 12. Обслуживание и резервные копии —————

adminRouter.get('/backup', async (_req, res) => {
  // Реального облачного бэкапа управляется из панели TiDB Cloud — здесь только
  // безопасные инструменты: инвентарь таблиц и инструкция.
  const tables = await rows<{ table_name: string; row_count: string }>(
    `SELECT c.relname AS table_name,
            (SELECT n_live_tup FROM pg_stat_user_tables s WHERE s.relid = c.oid) AS row_count
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema() AND c.relkind = 'r'
     ORDER BY c.relname`,
  ).catch(async () =>
    rows<{ table_name: string; row_count: string }>(
      `SELECT table_name, '0' AS row_count
       FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    ),
  );

  res.json({
    available: true,
    method: 'tidb-cloud-console',
    instructions:
      'Полное резервное копирование выполняется в панели TiDB Cloud: кластер → Maintenance → Backup. ' +
      'Для выгрузки данных используйте pg_dump с параметрами подключения из .env.local (не коммитьте их).',
    tables: tables.map((row) => ({ name: row.table_name, rows: Number(row.row_count ?? 0) })),
    note: 'Сервер не хранит файлы и бинарные данные — выгрузка текстовая.',
  });
});

adminRouter.post(
  '/maintenance/reindex',
  rateLimit({ name: 'admin-reindex', windowMs: 60_000, max: 4 }),
  async (req, res) => {
    const admin = requireAdmin(req);
    // ANALYZE — безопасная команда обновления статистики планировщика.
    await query('ANALYZE');
    await logAdmin(admin.id, 'maintenance_analyze', null, null, {});
    res.json({ ok: true, message: 'Статистика планировщика обновлена (ANALYZE).' });
  },
);

// Служебный эндпоинт для проверки guard'а (используется тестами).
adminRouter.get('/guard-check', modOnly, (_req, res) => {
  res.json({ ok: true });
});

void getPool;
void awardXp;
void computeLevelProgress;
void getLevelProgress;
