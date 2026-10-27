// Комментарии и ответы: создание, редактирование, удаление, принятый ответ,
// упоминания @username и уведомления участникам.

import type { Queryable } from '../db/sql';
import { one, rows, withTransaction } from '../db/sql';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { awardXp, getXpRules } from './xp';
import { createNotification } from './notifications';
import { reactionsFor } from './reactions';
import { findUserByUsername, toAuthorDto } from './users';
import type { CommentDto, SessionUser } from '../../shared/types';

type CommentRow = {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  status: 'visible' | 'hidden' | 'removed';
  is_accepted: boolean;
  reaction_score: number;
  created_at: Date;
  edited_at: Date | null;
  author_id: string;
  author_username: string | null;
  author_display_name: string;
  author_role: 'user' | 'moderator' | 'admin';
  author_level: number;
  author_reputation: number;
  post_author_id: string;
  post_type: string;
  post_status: string;
  post_locked: boolean;
};

const COMMENT_SELECT = `
  SELECT c.id, c.post_id, c.parent_id, c.body, c.status, c.is_accepted, c.reaction_score,
         c.created_at, c.edited_at,
         u.id AS author_id, u.username AS author_username, u.display_name AS author_display_name,
         u.role AS author_role, u.level AS author_level, u.reputation AS author_reputation,
         p.author_id AS post_author_id, p.type AS post_type, p.status AS post_status, p.is_locked AS post_locked
  FROM comments c
  JOIN users u ON u.id = c.author_id
  JOIN posts p ON p.id = c.post_id
`;

export type CommentSort = 'old' | 'new' | 'top';

export async function listComments(
  postId: string,
  viewer: SessionUser | null,
  sort: CommentSort,
  db: Queryable,
): Promise<CommentDto[]> {
  const order =
    sort === 'top'
      ? 'c.is_accepted DESC, c.reaction_score DESC, c.created_at ASC'
      : sort === 'new'
        ? 'c.is_accepted DESC, c.created_at DESC'
        : 'c.is_accepted DESC, c.created_at ASC';

  const list = await rows<CommentRow>(
    `${COMMENT_SELECT} WHERE c.post_id = $1 AND c.status <> 'removed' ORDER BY ${order} LIMIT 500`,
    [postId],
    db,
  );

  const ids = list.map((row) => row.id);
  const myReactions = await reactionsFor(viewer?.id ?? null, 'comment', ids, db);
  const isMod = viewer?.role === 'admin' || viewer?.role === 'moderator';

  const byId = new Map<string, CommentDto>();
  for (const row of list) {
    const isAuthor = viewer?.id === row.author_id;
    byId.set(row.id, {
      id: row.id,
      postId: row.post_id,
      parentId: row.parent_id,
      body: row.status === 'hidden' && !isAuthor && !isMod ? '' : row.body,
      author: toAuthorDto({
        id: row.author_id,
        username: row.author_username,
        display_name: row.author_display_name,
        role: row.author_role,
        level: row.author_level,
        reputation: row.author_reputation,
      }),
      status: row.status,
      isAccepted: row.is_accepted,
      reactionScore: row.reaction_score,
      createdAt: new Date(row.created_at).toISOString(),
      editedAt: row.edited_at ? new Date(row.edited_at).toISOString() : null,
      viewer: {
        myReaction: myReactions.get(row.id) ?? null,
        canEdit: Boolean(isAuthor || isMod),
        canDelete: Boolean(isAuthor || isMod),
        canAccept:
          row.post_type === 'question' &&
          viewer?.id === row.post_author_id &&
          row.status === 'visible' &&
          !row.post_locked,
      },
    });
  }

  // Родитель, скрытый или отсутствующий — ответы висят на посту.
  const result: CommentDto[] = [];
  for (const row of list) {
    const dto = byId.get(row.id)!;
    const parent = row.parent_id ? byId.get(row.parent_id) : undefined;
    result.push(parent ? dto : { ...dto, parentId: null });
  }
  // Упорядочим: корневые в выбранном порядке, ответы сразу после родителя.
  const ordered: CommentDto[] = [];
  const roots = result.filter((item) => item.parentId === null);
  for (const root of roots) {
    ordered.push(root);
    const replies = result.filter((item) => item.parentId === root.id);
    ordered.push(...replies);
  }
  return ordered;
}

// ————— Упоминания —————

const MENTION_RE = /@([a-z0-9][a-z0-9_.-]{1,22}[a-z0-9])/gi;

export async function extractMentions(body: string, db: Queryable): Promise<string[]> {
  const names = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) {
    const name = match[1]!.toLowerCase();
    if (name.length >= 3) names.add(name);
  }
  const users: string[] = [];
  for (const name of names) {
    const user = await findUserByUsername(name, db);
    if (user?.username) users.push(user.id);
  }
  return users;
}

async function recordMentions(
  sourceType: 'post' | 'comment',
  sourceId: string,
  authorId: string,
  mentionedIds: string[],
  postId: string | null,
  db: Queryable,
): Promise<void> {
  for (const userId of mentionedIds) {
    await db.query(
      `INSERT INTO mentions (id, source_type, source_id, author_id, mentioned_user_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (source_type, source_id, mentioned_user_id) DO NOTHING`,
      [newId(), sourceType, sourceId, authorId, userId],
    );
    await createNotification(db, {
      userId,
      type: 'mention',
      actorId: authorId,
      entityType: sourceType,
      entityId: sourceId,
      postId,
      payload: {},
    });
  }
}

// ————— Создание —————

export async function createComment(
  viewer: SessionUser,
  postId: string,
  input: { body: string; parentId?: string | null },
  db: Queryable,
): Promise<CommentDto> {
  const post = await one<{
    id: string;
    author_id: string;
    type: string;
    status: string;
    is_locked: boolean;
  }>('SELECT id, author_id, type, status, is_locked FROM posts WHERE id = $1', [postId], db);
  if (!post || post.status === 'removed') throw notFound('Публикация не найдена.');
  if (post.status !== 'published') throw conflict('Комментарии открыты только для опубликованных материалов.');
  if (post.is_locked) throw conflict('Обсуждение закрыто.');

  let parentAuthorId: string | null = null;
  if (input.parentId) {
    const parent = await one<{ id: string; author_id: string; parent_id: string | null }>(
      'SELECT id, author_id, parent_id FROM comments WHERE id = $1 AND post_id = $2',
      [input.parentId, postId],
      db,
    );
    if (!parent) throw badRequest('Родительский комментарий не найден.');
    parentAuthorId = parent.author_id;
  }

  const id = newId();
  await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO comments (id, post_id, author_id, parent_id, body)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, postId, viewer.id, input.parentId ?? null, input.body],
    );
    await tx.query(
      `UPDATE posts
       SET comment_count = comment_count + 1, last_activity_at = now(), updated_at = now()
       WHERE id = $1`,
      [postId],
    );

    // Участники автоматически следят за обсуждением (для уведомлений).
    await tx.query(
      'INSERT INTO post_watches (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [viewer.id, postId],
    );

    const rules = await getXpRules(tx);
    await awardXp(tx, {
      userId: viewer.id,
      kind: 'comment',
      xp: rules.comment ?? 3,
      reason: 'Комментарий',
      sourceType: 'comment',
      sourceId: id,
    });

    // Уведомления: ответ автору комментария, комментарий автору поста.
    if (parentAuthorId && parentAuthorId !== viewer.id) {
      await createNotification(tx, {
        userId: parentAuthorId,
        type: 'reply',
        actorId: viewer.id,
        entityType: 'comment',
        entityId: id,
        postId,
        payload: { excerpt: input.body.slice(0, 140) },
      });
    } else if (post.author_id !== viewer.id) {
      await createNotification(tx, {
        userId: post.author_id,
        type: 'comment',
        actorId: viewer.id,
        entityType: 'comment',
        entityId: id,
        postId,
        payload: { excerpt: input.body.slice(0, 140) },
      });
    }

    const mentioned = await extractMentions(input.body, tx);
    await recordMentions('comment', id, viewer.id, mentioned, postId, tx);

    // Уведомление тем, кто следит за обсуждением (кроме уже уведомлённых).
    const watchers = await tx.query<{ user_id: string }>(
      'SELECT user_id FROM post_watches WHERE post_id = $1 AND user_id <> $2',
      [postId, viewer.id],
    );
    const notified = new Set<string>([viewer.id, parentAuthorId ?? '', post.author_id]);
    for (const watcher of watchers.rows) {
      if (notified.has(watcher.user_id)) continue;
      notified.add(watcher.user_id);
      await createNotification(tx, {
        userId: watcher.user_id,
        type: 'watch_activity',
        actorId: viewer.id,
        entityType: 'comment',
        entityId: id,
        postId,
        payload: { excerpt: input.body.slice(0, 140) },
      });
    }
    return true;
  });

  const row = await one<CommentRow>(`${COMMENT_SELECT} WHERE c.id = $1`, [id], db);
  if (!row) throw notFound('Комментарий не найден.');
  const myReactions = await reactionsFor(viewer.id, 'comment', [id], db);
  return {
    id: row.id,
    postId: row.post_id,
    parentId: row.parent_id,
    body: row.body,
    author: toAuthorDto({
      id: row.author_id,
      username: row.author_username,
      display_name: row.author_display_name,
      role: row.author_role,
      level: row.author_level,
      reputation: row.author_reputation,
    }),
    status: row.status,
    isAccepted: row.is_accepted,
    reactionScore: row.reaction_score,
    createdAt: new Date(row.created_at).toISOString(),
    editedAt: row.edited_at ? new Date(row.edited_at).toISOString() : null,
    viewer: {
      myReaction: myReactions.get(id) ?? null,
      canEdit: true,
      canDelete: true,
      canAccept: row.post_type === 'question' && viewer.id === row.post_author_id,
    },
  };
}

// ————— Редактирование / удаление —————

export async function updateComment(
  commentId: string,
  viewer: SessionUser,
  body: string,
  db: Queryable,
): Promise<void> {
  const row = await one<{ author_id: string; status: string; post_id: string }>(
    'SELECT author_id, status, post_id FROM comments WHERE id = $1',
    [commentId],
    db,
  );
  if (!row || row.status === 'removed') throw notFound('Комментарий не найден.');
  const isMod = viewer.role === 'admin' || viewer.role === 'moderator';
  if (row.author_id !== viewer.id && !isMod) throw forbidden('Нет прав на редактирование.');

  await db.query(
    'UPDATE comments SET body = $2, edited_at = now(), updated_at = now() WHERE id = $1',
    [commentId, body],
  );

  // Обновляем упоминания при редактировании.
  await db.query('DELETE FROM mentions WHERE source_type = $1 AND source_id = $2', [
    'comment',
    commentId,
  ]);
  const mentioned = await extractMentions(body, db);
  await recordMentions('comment', commentId, viewer.id, mentioned, row.post_id, db);
}

export async function deleteComment(
  commentId: string,
  viewer: SessionUser,
  db: Queryable,
): Promise<void> {
  const row = await one<{ author_id: string; status: string; post_id: string }>(
    'SELECT author_id, status, post_id FROM comments WHERE id = $1',
    [commentId],
    db,
  );
  if (!row || row.status === 'removed') throw notFound('Комментарий не найден.');
  const isMod = viewer.role === 'admin' || viewer.role === 'moderator';
  if (row.author_id !== viewer.id && !isMod) throw forbidden('Нет прав на удаление.');

  await withTransaction(async (tx) => {
    await tx.query("UPDATE comments SET status = 'removed', updated_at = now() WHERE id = $1", [
      commentId,
    ]);
    // Пересчитываем счётчик: учитываем только видимые.
    const count = await one<{ count: string }>(
      "SELECT count(*) AS count FROM comments WHERE post_id = $1 AND status = 'visible'",
      [row.post_id],
      tx,
    );
    await tx.query('UPDATE posts SET comment_count = $2, updated_at = now() WHERE id = $1', [
      row.post_id,
      Number(count?.count ?? 0),
    ]);
  });
}

// ————— Принятый ответ —————

export async function setAcceptedAnswer(
  commentId: string,
  viewer: SessionUser,
  accept: boolean,
  db: Queryable,
): Promise<{ accepted: boolean }> {
  const row = await one<CommentRow>(`${COMMENT_SELECT} WHERE c.id = $1`, [commentId], db);
  if (!row || row.status === 'removed') throw notFound('Комментарий не найден.');
  if (row.post_type !== 'question') throw badRequest('Принять ответ можно только в вопросе.');
  if (row.post_author_id !== viewer.id && viewer.role !== 'admin') {
    throw forbidden('Принимать ответ может только автор вопроса.');
  }

  await withTransaction(async (tx) => {
    if (accept) {
      // Снимаем прежний принятый ответ.
      await tx.query(
        `UPDATE comments SET is_accepted = false
         WHERE post_id = $1 AND is_accepted = true AND id <> $2`,
        [row.post_id, commentId],
      );
      await tx.query('UPDATE comments SET is_accepted = true WHERE id = $1', [commentId]);
      await tx.query('UPDATE posts SET accepted_answer_id = $2, updated_at = now() WHERE id = $1', [
        row.post_id,
        commentId,
      ]);
      if (row.author_id !== viewer.id) {
        await createNotification(tx, {
          userId: row.author_id,
          type: 'answer_accepted',
          actorId: viewer.id,
          entityType: 'comment',
          entityId: commentId,
          postId: row.post_id,
          payload: {},
        });
        const rules = await getXpRules(tx);
        await awardXp(tx, {
          userId: row.author_id,
          kind: 'answer_accepted',
          xp: rules.answer_accepted ?? 25,
          rep: 10,
          reason: 'Ответ принят автором вопроса',
          sourceType: 'comment',
          sourceId: commentId,
        });
      }
    } else {
      await tx.query('UPDATE comments SET is_accepted = false WHERE id = $1', [commentId]);
      await tx.query(
        `UPDATE posts SET accepted_answer_id = NULL, updated_at = now()
         WHERE id = $1 AND accepted_answer_id = $2`,
        [row.post_id, commentId],
      );
    }
  });

  return { accepted: accept };
}
