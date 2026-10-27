// Реакции «лайк/дизлайк»: один голос пользователя на объект.
// Повторное нажатие на то же значение снимает голос, противоположное — меняет.
// Итоговый рейтинг пересчитывается на сервере из таблицы reactions (источник истины).

import type { Queryable } from '../db/sql';
import { one, withTransaction } from '../db/sql';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { awardXp, getXpRules } from './xp';

export type ReactionTarget = 'post' | 'comment';

export type ReactionResult = {
  myReaction: 1 | -1 | null;
  score: number;
};

async function loadTarget(
  db: Queryable,
  targetType: ReactionTarget,
  targetId: string,
): Promise<{ authorId: string; status: string; score: number }> {
  if (targetType === 'post') {
    const row = await one<{ author_id: string; status: string; reaction_score: number }>(
      'SELECT author_id, status, reaction_score FROM posts WHERE id = $1',
      [targetId],
      db,
    );
    if (!row || row.status === 'removed') throw notFound('Публикация не найдена.');
    return { authorId: row.author_id, status: row.status, score: row.reaction_score };
  }
  const row = await one<{ author_id: string; status: string; reaction_score: number }>(
    'SELECT author_id, status, reaction_score FROM comments WHERE id = $1',
    [targetId],
    db,
  );
  if (!row || row.status === 'removed') throw notFound('Комментарий не найден.');
  return { authorId: row.author_id, status: row.status, score: row.reaction_score };
}

async function recalcScore(
  db: Queryable,
  targetType: ReactionTarget,
  targetId: string,
): Promise<number> {
  const table = targetType === 'post' ? 'posts' : 'comments';
  const row = await one<{ score: string }>(
    `UPDATE ${table}
     SET reaction_score = (
       SELECT COALESCE(sum(value), 0) FROM reactions
       WHERE target_type = $2 AND target_id = $1
     ),
     updated_at = now()
     WHERE id = $1
     RETURNING reaction_score AS score`,
    [targetId, targetType],
    db,
  );
  return Number(row?.score ?? 0);
}

/**
 * Ставит/меняет/снимает голос. Возвращает новое состояние и рейтинг.
 * Атомарно внутри транзакции: повторные параллельные запросы не создают дублей.
 */
export async function setReaction(
  userId: string,
  targetType: ReactionTarget,
  targetId: string,
  value: 1 | -1,
  db: Queryable,
): Promise<ReactionResult> {
  if (targetType !== 'post' && targetType !== 'comment') {
    throw badRequest('Недопустимый объект реакции.');
  }

  const target = await loadTarget(db, targetType, targetId);
  if (targetType === 'post' && target.status !== 'published') {
    throw forbidden('Голосовать можно только за опубликованные материалы.');
  }

  return withTransaction(async (tx) => {
    const existing = await one<{ value: number }>(
      'SELECT value FROM reactions WHERE target_type = $1 AND target_id = $2 AND user_id = $3',
      [targetType, targetId, userId],
      tx,
    );

    let next: 1 | -1 | null = value;
    if (existing && existing.value === value) {
      // Повторное нажатие — снятие голоса.
      await tx.query(
        'DELETE FROM reactions WHERE target_type = $1 AND target_id = $2 AND user_id = $3',
        [targetType, targetId, userId],
      );
      next = null;
    } else if (existing) {
      await tx.query(
        'UPDATE reactions SET value = $4, updated_at = now() WHERE target_type = $1 AND target_id = $2 AND user_id = $3',
        [targetType, targetId, userId, value],
      );
      next = value;
    } else {
      await tx.query(
        `INSERT INTO reactions (target_type, target_id, user_id, value)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (target_type, target_id, user_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [targetType, targetId, userId, value],
      );
      next = value;
    }

    const score = await recalcScore(tx, targetType, targetId);

    // Репутация автору за положительную реакцию: не более 1 раза от каждого
    // пользователя на объект (уникальный ключ progress_events).
    if (next === 1 && target.authorId !== userId) {
      const rules = await getXpRules(tx);
      await awardXp(tx, {
        userId: target.authorId,
        kind: 'received_reaction',
        xp: targetType === 'comment' ? (rules.comment_received_reaction ?? 5) : 0,
        rep: 1,
        reason: targetType === 'comment' ? 'Полезный комментарий' : 'Полезная публикация',
        sourceType: `reaction_${targetType}`,
        sourceId: `${targetId}:${userId}`,
      });
    }

    return { myReaction: next, score };
  });
}

/** Пакетное получение голосов текущего пользователя для списка объектов. */
export async function reactionsFor(
  userId: string | null,
  targetType: ReactionTarget,
  targetIds: string[],
  db: Queryable,
): Promise<Map<string, 1 | -1>> {
  const map = new Map<string, 1 | -1>();
  if (!userId || targetIds.length === 0) return map;
  const placeholders = targetIds.map((_, index) => `$${index + 3}`).join(', ');
  const list = await rowsSafe(
    `SELECT target_id, value FROM reactions
     WHERE target_type = $1 AND user_id = $2 AND target_id IN (${placeholders})`,
    [targetType, userId, ...targetIds],
    db,
  );
  for (const row of list) map.set(row.target_id, row.value === 1 ? 1 : -1);
  return map;
}

async function rowsSafe<T extends { target_id: string; value: number }>(
  text: string,
  params: unknown[],
  db: Queryable,
): Promise<T[]> {
  const result = await db.query<T>(text, params);
  return result.rows;
}
