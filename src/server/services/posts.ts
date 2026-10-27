// Публикации: создание, обновление, лента с фильтрами, избранное, наблюдение.
// Единый фундамент для всех типов: общие поля в posts, специфика — в typeData.

import type { Queryable } from '../db/sql';
import { one, rows } from '../db/sql';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import type {
  CategoryDto,
  FeedQuery,
  Paginated,
  PostCard,
  PostDetail,
  PostStatus,
  SessionUser,
  TagDto,
} from '../../shared/types';
import { isPostType, type PostType } from '../../shared/post-types';
import { authorsByIds, toAuthorDto } from './users';
import { ensureTags, parseTagInputs, recalcTagUsage, tagsForPosts } from './tags';
import { loadTypeData, persistTypeData } from './type-data';

// ————— Черновик текста для карточки —————

export function makeExcerpt(body: string): string {
  const plain = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 240 ? `${plain.slice(0, 237).trimEnd()}…` : plain;
}

// ————— Разбор строки публикации —————

type PostRow = {
  id: string;
  type: PostType;
  title: string;
  excerpt: string;
  status: PostStatus;
  is_pinned: boolean;
  is_locked: boolean;
  comment_count: number;
  reaction_score: number;
  favorite_count: number;
  accepted_answer_id: string | null;
  published_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  edited_at: Date | string | null;
  last_activity_at: Date | string;
  author_id: string;
  author_username: string | null;
  author_display_name: string;
  author_role: 'user' | 'moderator' | 'admin';
  author_level: number;
  author_reputation: number;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  category_description: string | null;
  category_color: string | null;
};

const POST_COLS = `
  p.id, p.type, p.title, p.excerpt, p.status, p.is_pinned, p.is_locked,
  p.comment_count, p.reaction_score, p.favorite_count, p.accepted_answer_id,
  p.published_at, p.created_at, p.updated_at, p.edited_at, p.last_activity_at,
  u.id AS author_id, u.username AS author_username, u.display_name AS author_display_name,
  u.role AS author_role, u.level AS author_level, u.reputation AS author_reputation,
  c.id AS category_id, c.slug AS category_slug, c.name AS category_name,
  c.description AS category_description, c.color AS category_color
`;

const POST_FROM = `
  FROM posts p
  JOIN users u ON u.id = p.author_id
  LEFT JOIN categories c ON c.id = p.category_id
`;

const POST_SELECT = `SELECT ${POST_COLS} ${POST_FROM}`;

function iso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function categoryDto(row: PostRow): CategoryDto | null {
  if (!row.category_id || !row.category_slug || !row.category_name) return null;
  return {
    id: row.category_id,
    slug: row.category_slug,
    name: row.category_name,
    description: row.category_description,
    color: row.category_color ?? 'slate',
  };
}

function toPostCard(
  row: PostRow,
  tags: TagDto[],
  viewer: {
    myReaction: 1 | -1 | null;
    favorited: boolean;
    watching: boolean;
    canEdit: boolean;
    canComment: boolean;
    canModerate: boolean;
  },
): PostCard {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    excerpt: row.excerpt,
    status: row.status,
    author: toAuthorDto({
      id: row.author_id,
      username: row.author_username,
      display_name: row.author_display_name,
      role: row.author_role,
      level: row.author_level,
      reputation: row.author_reputation,
    }),
    category: categoryDto(row),
    tags,
    counts: {
      comments: row.comment_count,
      reactions: row.reaction_score,
      favorites: row.favorite_count,
    },
    isPinned: row.is_pinned,
    isLocked: row.is_locked,
    publishedAt: iso(row.published_at),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    editedAt: iso(row.edited_at),
    lastActivityAt: new Date(row.last_activity_at).toISOString(),
    acceptedAnswerId: row.accepted_answer_id,
    viewer,
  };
}

// ————— Пакетные данные просмотра —————

type ViewerFlags = {
  myReaction: 1 | -1 | null;
  favorited: boolean;
  watching: boolean;
};

async function viewerFlags(
  postIds: string[],
  userId: string | null,
  db: Queryable,
): Promise<Map<string, ViewerFlags>> {
  const map = new Map<string, ViewerFlags>();
  for (const id of postIds) map.set(id, { myReaction: null, favorited: false, watching: false });
  if (!userId || postIds.length === 0) return map;

  const placeholders = postIds.map((_, index) => `$${index + 2}`).join(', ');
  const [reactions, favorites, watches] = await Promise.all([
    rows<{ target_id: string; value: number }>(
      `SELECT target_id, value FROM reactions
       WHERE target_type = 'post' AND user_id = $1 AND target_id IN (${placeholders})`,
      [userId, ...postIds],
      db,
    ),
    rows<{ post_id: string }>(
      `SELECT post_id FROM favorites WHERE user_id = $1 AND post_id IN (${placeholders})`,
      [userId, ...postIds],
      db,
    ),
    rows<{ post_id: string }>(
      `SELECT post_id FROM post_watches WHERE user_id = $1 AND post_id IN (${placeholders})`,
      [userId, ...postIds],
      db,
    ),
  ]);
  for (const row of reactions) {
    const flag = map.get(row.target_id);
    if (flag) flag.myReaction = row.value === 1 ? 1 : -1;
  }
  for (const row of favorites) {
    const flag = map.get(row.post_id);
    if (flag) flag.favorited = true;
  }
  for (const row of watches) {
    const flag = map.get(row.post_id);
    if (flag) flag.watching = true;
  }
  return map;
}

// ————— Лента —————

type WhereClause = { sql: string; params: unknown[] };

function buildFilters(query: FeedQuery, viewerId: string | null): WhereClause {
  const params: unknown[] = [];
  const conditions: string[] = [];

  // Статус: аноним и чужие видят только опубликованное; автор/модератор — своё.
  if (query.mine && viewerId) {
    params.push(viewerId);
    conditions.push(`p.author_id = $${params.length}`);
    if (query.status) {
      params.push(query.status);
      conditions.push(`p.status = $${params.length}`);
    }
  } else {
    conditions.push(`p.status = 'published'`);
    if (query.status && query.status !== 'published') {
      params.push(query.status);
      conditions.push(`p.status = $${params.length}`);
    }
  }

  if (query.type) {
    params.push(query.type);
    conditions.push(`p.type = $${params.length}`);
  }
  if (query.category) {
    params.push(query.category);
    conditions.push(`c.slug = $${params.length}`);
  }
  if (query.author) {
    params.push(query.author.toLowerCase());
    conditions.push(`u.username_lower = $${params.length}`);
  }
  if (query.q) {
    params.push(`%${query.q}%`);
    const idx = params.length;
    conditions.push(`(p.title ILIKE $${idx} OR p.body ILIKE $${idx} OR u.display_name ILIKE $${idx})`);
  }
  if (query.tag) {
    params.push(query.tag.toLowerCase());
    conditions.push(`EXISTS (
      SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
      WHERE pt.post_id = p.id AND t.slug = $${params.length}
    )`);
  }

  // Избранное: только материалы, сохранённые текущим пользователем.
  if (query.favorite) {
    if (!viewerId) {
      conditions.push('1 = 0');
    } else {
      params.push(viewerId);
      conditions.push(`EXISTS (
        SELECT 1 FROM favorites f WHERE f.post_id = p.id AND f.user_id = $${params.length}
      )`);
    }
  }

  // Скрытые материалы/авторы/категории не показываются в ленте.
  if (viewerId) {
    params.push(viewerId);
    const idx = params.length;
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM feed_hides h
      WHERE h.user_id = $${idx}
        AND ((h.target_type = 'post' AND h.target_id = p.id)
          OR (h.target_type = 'author' AND h.target_id = p.author_id)
          OR (h.target_type = 'category' AND h.target_id = p.category_id))
    )`);
  }

  // Режим «Подписки»: авторы, на которых подписан, и подписки на теги.
  if (query.mode === 'following') {
    if (!viewerId) {
      conditions.push('1 = 0');
    } else {
      params.push(viewerId);
      const idx = params.length;
      conditions.push(`(
        p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = $${idx})
        OR EXISTS (
          SELECT 1 FROM post_tags pt
          JOIN tag_subscriptions ts ON ts.tag_id = pt.tag_id
          WHERE pt.post_id = p.id AND ts.user_id = $${idx}
        )
      )`);
    }
  }

  // «Для меня»: интересы и подписки влияют на порядок (см. buildOrder).
  return { sql: conditions.join(' AND '), params };
}

function buildOrder(query: FeedQuery, viewerId: string | null): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  let order: string;

  if (query.sort === 'top') {
    order = '(p.reaction_score * 2 + p.comment_count * 3) DESC, p.published_at DESC';
  } else if (query.sort === 'comments') {
    order = 'p.comment_count DESC, p.published_at DESC';
  } else if (query.mode === 'for-you' && viewerId) {
    params.push(viewerId, viewerId);
    const i1 = params.length - 1;
    const i2 = params.length;
    order = `(
      CASE WHEN p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = $${i1}) THEN 45 ELSE 0 END
      + CASE WHEN EXISTS (
          SELECT 1 FROM post_tags pt JOIN user_interests ui ON ui.tag_id = pt.tag_id
          WHERE pt.post_id = p.id AND ui.user_id = $${i2}
        ) THEN 35 ELSE 0 END
      + CASE WHEN EXISTS (
          SELECT 1 FROM post_tags pt JOIN tag_subscriptions ts ON ts.tag_id = pt.tag_id
          WHERE pt.post_id = p.id AND ts.user_id = $${i2}
        ) THEN 20 ELSE 0 END
      + GREATEST(0, 40 - EXTRACT(EPOCH FROM (now() - COALESCE(p.published_at, p.created_at))) / 14400)
    ) DESC, p.published_at DESC`;
  } else if (query.mode === 'popular') {
    order =
      '(p.reaction_score * 2 + p.comment_count * 3) ' +
      '+ GREATEST(0, 30 - EXTRACT(EPOCH FROM (now() - COALESCE(p.published_at, p.created_at))) / 2880) ' +
      'DESC, p.published_at DESC';
  } else {
    order = 'COALESCE(p.published_at, p.created_at) DESC';
  }

  // Закреплённые — сверху.
  return { sql: `p.is_pinned DESC, ${order}`, params };
}

export async function listPosts(
  query: FeedQuery,
  viewer: SessionUser | null,
  db: Queryable,
): Promise<Paginated<PostCard>> {
  const viewerId = viewer?.id ?? null;
  const filter = buildFilters(query, viewerId);
  const order = buildOrder(query, viewerId);
  const where = filter.sql;

  // Ограничение «один автор — не больше 3 подряд» предотвращает затопление ленты.
  const limit = query.pageSize;
  const offset = (query.page - 1) * query.pageSize;

  const listParams = [...filter.params, ...order.params];
  const limitIdx = listParams.length + 1;
  const offsetIdx = listParams.length + 2;
  listParams.push(limit + 1, offset);

  // Внешний ORDER BY работает с колонками производной таблицы (без префикса p.).
  const outerOrder = order.sql.replace(/\bp\./g, '');

  const list = await rows<PostRow & { rn: number }>(
    `SELECT * FROM (
       SELECT ${POST_COLS},
         ROW_NUMBER() OVER (PARTITION BY p.author_id ORDER BY ${order.sql}) AS rn
       ${POST_FROM}
       WHERE ${where}
     ) deduped
     WHERE deduped.rn <= 3
     ORDER BY ${outerOrder}
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    listParams,
    db,
  );

  const totalRow = await one<{ count: string }>(
    `SELECT count(*) AS count
     FROM posts p
     JOIN users u ON u.id = p.author_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${where}`,
    filter.params,
    db,
  );

  const hasMore = list.length > limit;
  const pageRows = hasMore ? list.slice(0, limit) : list;
  const total = Math.max(Number(totalRow?.count ?? 0), offset + pageRows.length);

  return hydrateCards(pageRows, viewer, { page: query.page, pageSize: limit, total, db });
}

async function hydrateCards(
  rows_: PostRow[],
  viewer: SessionUser | null,
  ctx: { page: number; pageSize: number; total: number; db: Queryable },
): Promise<Paginated<PostCard>> {
  const ids = rows_.map((row) => row.id);
  const [tagsMap, flags] = await Promise.all([
    tagsForPosts(ids, ctx.db),
    viewerFlags(ids, viewer?.id ?? null, ctx.db),
  ]);

  const isMod = viewer?.role === 'admin' || viewer?.role === 'moderator';
  const items = rows_.map((row) => {
    const flags_ = flags.get(row.id) ?? { myReaction: null, favorited: false, watching: false };
    const canEdit = Boolean(viewer && (viewer.id === row.author_id || isMod));
    return toPostCard(row, tagsMap.get(row.id) ?? [], {
      ...flags_,
      canEdit,
      canComment: row.status === 'published' && !row.is_locked && viewer?.status === 'active',
      canModerate: Boolean(isMod),
    });
  });

  return {
    items,
    page: ctx.page,
    pageSize: ctx.pageSize,
    total: ctx.total,
    hasMore: (ctx.page - 1) * ctx.pageSize + items.length < ctx.total,
  };
}

// ————— Детальная страница —————

export async function getPost(
  idOrSlug: string,
  viewer: SessionUser | null,
  db: Queryable,
): Promise<PostDetail> {
  const row = await one<PostRow>(`${POST_SELECT} WHERE p.id = $1`, [idOrSlug], db);
  if (!row) throw notFound('Публикация не найдена.');

  const isAuthor = viewer?.id === row.author_id;
  const isMod = viewer?.role === 'admin' || viewer?.role === 'moderator';
  if (row.status !== 'published' && !isAuthor && !isMod) {
    throw notFound('Публикация не найдена.');
  }

  const [tagsMap, flags, typeData, full] = await Promise.all([
    tagsForPosts([row.id], db),
    viewerFlags([row.id], viewer?.id ?? null, db),
    loadTypeData(row.id, row.type, viewer, db),
    one<{ body: string; comment_count_total: string }>(
      `SELECT p.body,
              (SELECT count(*) FROM comments c
                WHERE c.post_id = p.id AND c.status = 'visible') AS comment_count_total
       FROM posts p WHERE p.id = $1`,
      [row.id],
      db,
    ),
  ]);

  const collaborators = await rows<{ post_id: string; user_id: string }>(
    'SELECT post_id, user_id FROM post_collaborators WHERE post_id = $1',
    [row.id],
    db,
  );
  const collaboratorIds = collaborators.map((item) => item.user_id);
  const authors = await authorsByIds(
    [...collaboratorIds, ...(isAuthor || isMod ? [] : [])],
    db,
  );

  const flags_ = flags.get(row.id) ?? { myReaction: null, favorited: false, watching: false };
  const card = toPostCard(row, tagsMap.get(row.id) ?? [], {
    ...flags_,
    canEdit: Boolean(viewer && (isAuthor || isMod)),
    canComment: row.status === 'published' && !row.is_locked && viewer?.status === 'active',
    canModerate: Boolean(isMod),
  });

  return {
    ...card,
    body: full?.body ?? '',
    typeData,
    collaborators: collaboratorIds
      .map((uid) => authors.get(uid))
      .filter((author): author is NonNullable<typeof author> => Boolean(author)),
    commentCountTotal: Number(full?.comment_count_total ?? row.comment_count),
  };
}

// ————— Создание —————

export type CreatePostInput = {
  type: PostType;
  title: string;
  body: string;
  categoryId?: string | null;
  tags: string[];
  status: 'draft' | 'published';
  typeData?: unknown;
};

export async function createPost(
  authorId: string,
  input: CreatePostInput,
  db: Queryable,
): Promise<string> {
  if (!isPostType(input.type)) throw badRequest('Неизвестный тип публикации.');

  // Форматы, отключённые администратором, нельзя выбрать и создать заново.
  const typeSettings = await one<{ is_enabled: boolean }>(
    'SELECT is_enabled FROM post_type_settings WHERE type = $1',
    [input.type],
    db,
  );
  if (typeSettings && !typeSettings.is_enabled) {
    throw badRequest('Этот формат публикаций временно отключён администрацией.');
  }

  const id = newId();
  const published = input.status === 'published';

  if (input.categoryId) {
    const category = await one<{ id: string }>(
      'SELECT id FROM categories WHERE id = $1 AND is_active = true',
      [input.categoryId],
      db,
    );
    if (!category) throw badRequest('Категория не найдена.');
  }

  const tags = await ensureTags(db, parseTagInputs(input.tags));

  await one(
    `INSERT INTO posts (id, author_id, type, title, body, excerpt, category_id, status, published_at, last_activity_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${published ? 'now()' : 'NULL'}, now())
     RETURNING id`,
    [
      id,
      authorId,
      input.type,
      input.title,
      input.body,
      makeExcerpt(input.body),
      input.categoryId ?? null,
      published ? 'published' : 'draft',
    ],
    db,
  );

  for (const tag of tags) {
    await db.query(
      'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, tag.id],
    );
  }
  await recalcTagUsage(db, tags.map((tag) => tag.id));

  if (input.typeData !== undefined && input.typeData !== null) {
    await saveTypeData(id, input.type, input.typeData, db);
  }

  return id;
}

// ————— Обновление / публикация / удаление —————

export async function updatePost(
  postId: string,
  viewer: SessionUser,
  input: {
    title?: string;
    body?: string;
    categoryId?: string | null;
    tags?: string[];
    typeData?: unknown;
  },
  db: Queryable,
): Promise<void> {
  const row = await one<{ id: string; author_id: string; status: PostStatus; type: PostType }>(
    'SELECT id, author_id, status, type FROM posts WHERE id = $1',
    [postId],
    db,
  );
  if (!row) throw notFound('Публикация не найдена.');
  const isMod = viewer.role === 'admin' || viewer.role === 'moderator';
  if (row.author_id !== viewer.id && !isMod) throw forbidden('Нет прав на редактирование.');
  if (row.status === 'removed') throw conflict('Публикация удалена и недоступна для редактирования.');

  const sets: string[] = [];
  const params: unknown[] = [postId];
  const push = (fragment: string, value: unknown) => {
    params.push(value);
    sets.push(`${fragment} = $${params.length}`);
  };

  if (input.title !== undefined) push('title', input.title);
  if (input.body !== undefined) {
    push('body', input.body);
    params.push(makeExcerpt(input.body));
    sets.push(`excerpt = $${params.length}`);
  }
  if (input.categoryId !== undefined) push('category_id', input.categoryId || null);
  if (sets.length > 0) {
    sets.push('updated_at = now()', 'edited_at = now()');
    await db.query(`UPDATE posts SET ${sets.join(', ')} WHERE id = $1`, params);
  }

  if (input.tags) {
    const tags = await ensureTags(db, parseTagInputs(input.tags));
    await db.query('DELETE FROM post_tags WHERE post_id = $1', [postId]);
    for (const tag of tags) {
      await db.query(
        'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [postId, tag.id],
      );
    }
    await recalcTagUsage(db, tags.map((tag) => tag.id));
  }

  if (input.typeData !== undefined && input.typeData !== null) {
    await saveTypeData(postId, row.type, input.typeData, db);
  }
}

export async function publishPost(postId: string, viewer: SessionUser, db: Queryable): Promise<void> {
  const row = await one<{ author_id: string; status: PostStatus }>(
    'SELECT author_id, status FROM posts WHERE id = $1',
    [postId],
    db,
  );
  if (!row) throw notFound('Публикация не найдена.');
  if (row.author_id !== viewer.id && viewer.role !== 'admin' && viewer.role !== 'moderator') {
    throw forbidden('Нет прав на публикацию.');
  }
  if (row.status === 'published') throw conflict('Публикация уже опубликована.');
  if (row.status === 'removed') throw conflict('Публикация удалена.');
  await db.query(
    `UPDATE posts SET status = 'published', published_at = COALESCE(published_at, now()),
       last_activity_at = now(), updated_at = now()
     WHERE id = $1`,
    [postId],
  );
}

export async function removePost(postId: string, viewer: SessionUser, db: Queryable): Promise<void> {
  const row = await one<{ author_id: string }>('SELECT author_id FROM posts WHERE id = $1', [postId], db);
  if (!row) throw notFound('Публикация не найдена.');
  const isMod = viewer.role === 'admin' || viewer.role === 'moderator';
  if (row.author_id !== viewer.id && !isMod) throw forbidden('Нет прав на удаление.');
  await db.query(
    "UPDATE posts SET status = 'removed', updated_at = now(), last_activity_at = now() WHERE id = $1",
    [postId],
  );
}

// ————— Избранное и наблюдение —————

export async function setFavorite(
  userId: string,
  postId: string,
  on: boolean,
  db: Queryable,
): Promise<{ favorited: boolean; count: number }> {
  const post = await one<{ id: string; status: PostStatus }>(
    'SELECT id, status FROM posts WHERE id = $1',
    [postId],
    db,
  );
  if (!post || post.status === 'removed') throw notFound('Публикация не найдена.');
  if (post.status !== 'published') throw conflict('Можно добавлять в избранное только опубликованное.');

  if (on) {
    await db.query(
      'INSERT INTO favorites (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, postId],
    );
  } else {
    await db.query('DELETE FROM favorites WHERE user_id = $1 AND post_id = $2', [userId, postId]);
  }
  await db.query(
    'UPDATE posts SET favorite_count = (SELECT count(*) FROM favorites WHERE post_id = $1) WHERE id = $1',
    [postId],
  );
  const count = await one<{ count: string }>(
    'SELECT count(*) AS count FROM favorites WHERE post_id = $1',
    [postId],
    db,
  );
  return { favorited: on, count: Number(count?.count ?? 0) };
}

export async function setWatch(
  userId: string,
  postId: string,
  on: boolean,
  db: Queryable,
): Promise<{ watching: boolean }> {
  const post = await one<{ id: string; status: PostStatus }>(
    'SELECT id, status FROM posts WHERE id = $1',
    [postId],
    db,
  );
  if (!post || post.status === 'removed') throw notFound('Публикация не найдена.');
  if (on) {
    await db.query(
      'INSERT INTO post_watches (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, postId],
    );
  } else {
    await db.query('DELETE FROM post_watches WHERE user_id = $1 AND post_id = $2', [userId, postId]);
  }
  return { watching: on };
}

export async function hideFromFeed(
  userId: string,
  targetType: 'post' | 'author' | 'category',
  targetId: string,
  db: Queryable,
): Promise<void> {
  await db.query(
    `INSERT INTO feed_hides (user_id, target_type, target_id) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [userId, targetType, targetId],
  );
}

export async function unhideFromFeed(
  userId: string,
  targetType: 'post' | 'author' | 'category',
  targetId: string,
  db: Queryable,
): Promise<void> {
  await db.query('DELETE FROM feed_hides WHERE user_id = $1 AND target_type = $2 AND target_id = $3', [
    userId,
    targetType,
    targetId,
  ]);
}

// ————— Сохранённые фильтры —————

export async function listSavedFilters(userId: string, db: Queryable): Promise<
  { id: string; name: string; query: Record<string, unknown>; createdAt: string }[]
> {
  const list = await rows<{ id: string; name: string; query: Record<string, unknown>; created_at: Date }>(
    'SELECT id, name, query, created_at FROM saved_filters WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
    db,
  );
  return list.map((row) => ({
    id: row.id,
    name: row.name,
    query: row.query ?? {},
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function saveFilter(
  userId: string,
  name: string,
  query: Record<string, unknown>,
  db: Queryable,
): Promise<{ id: string }> {
  const existing = await one<{ count: string }>(
    'SELECT count(*) AS count FROM saved_filters WHERE user_id = $1',
    [userId],
    db,
  );
  if (Number(existing?.count ?? 0) >= 30) throw conflict('Достигнут лимит сохранённых фильтров.');
  const id = newId();
  await db.query('INSERT INTO saved_filters (id, user_id, name, query) VALUES ($1, $2, $3, $4)', [
    id,
    userId,
    name,
    JSON.stringify(query),
  ]);
  return { id };
}

export async function deleteFilter(userId: string, id: string, db: Queryable): Promise<void> {
  await db.query('DELETE FROM saved_filters WHERE id = $1 AND user_id = $2', [id, userId]);
}

// ————— Загрузка данных типа (create) —————

async function saveTypeData(postId: string, type: PostType, data: unknown, db: Queryable): Promise<void> {
  await persistTypeData(postId, type, data, db);
}
