// Действия над структурированными типами: голосование в опросе, заявки в команду
// (с защитой от превышения мест), участие в событии, прогресс цели, чек-лист.

import type { Queryable } from '../db/sql';
import { one } from '../db/sql';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';import { newId } from '../lib/ids';
import { createNotification } from './notifications';
import { awardXp, getXpRules } from './xp';

// ————— Опрос —————

export async function votePoll(
  userId: string,
  postId: string,
  optionId: string,
  db: Queryable,
): Promise<{ myVote: string; totalVotes: number }> {
  const tx = db;
    const poll = await one<{ status: string; closes_at: Date | null; show_results_after_vote: boolean }>(
      'SELECT status, closes_at, show_results_after_vote FROM polls WHERE post_id = $1 FOR UPDATE',
      [postId],
      tx,
    );
    if (!poll) throw notFound('Опрос не найден.');
    if (poll.status === 'closed') throw conflict('Опрос закрыт.');
    if (poll.closes_at && new Date(poll.closes_at).getTime() <= Date.now()) {
      throw conflict('Срок голосования истёк.');
    }

    const option = await one<{ id: string }>(
      'SELECT id FROM poll_options WHERE id = $1 AND poll_id = $2',
      [optionId, postId],
      tx,
    );
    if (!option) throw badRequest('Вариант не найден.');

    const existing = await one<{ option_id: string }>(
      'SELECT option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
      [postId, userId],
      tx,
    );
    if (existing) {
      if (existing.option_id === optionId) {
        throw conflict('Вы уже голосовали за этот вариант.');
      }
      // Смена голоса запрещена: один пользователь — один голос.
      throw conflict('Вы уже проголосовали в этом опросе.');
    }

    await tx.query('INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES ($1, $2, $3)', [
      postId,
      optionId,
      userId,
    ]);
    await tx.query('UPDATE poll_options SET votes_count = votes_count + 1 WHERE id = $1', [optionId]);
    await tx.query(
      `UPDATE polls SET total_votes = (
         SELECT count(*) FROM poll_votes WHERE poll_id = $1
       ) WHERE post_id = $1`,
      [postId],
    );

    const total = await one<{ total: number }>(
      'SELECT total_votes AS total FROM polls WHERE post_id = $1',
      [postId],
      tx,
    );
    return { myVote: optionId, totalVotes: Number(total?.total ?? 0) };
}

// ————— Заявки в команду —————

async function requireTeamPost(postId: string, db: Queryable): Promise<{ authorId: string; status: string }> {
  const post = await one<{ author_id: string; status: string }>(
    "SELECT author_id, status FROM posts WHERE id = $1 AND type = 'team'",
    [postId],
    db,
  );
  if (!post || post.status === 'removed') throw notFound('Карточка команды не найдена.');
  if (post.status !== 'published') throw conflict('Карточка не опубликована.');
  return { authorId: post.author_id, status: post.status };
}

export async function applyToTeam(
  userId: string,
  postId: string,
  input: { roleId: string; message: string },
  db: Queryable,
): Promise<{ id: string }> {
  const post = await requireTeamPost(postId, db);
  if (post.authorId === userId) throw badRequest('Вы автор этой команды.');

  const tx = db;
    const role = await one<{ id: string; capacity: number; filled: number }>(
      'SELECT id, capacity, filled FROM project_roles WHERE id = $1 AND post_id = $2 FOR UPDATE',
      [input.roleId, postId],
      tx,
    );
    if (!role) throw badRequest('Роль не найдена.');

    const existing = await one<{ id: string; status: string }>(
      'SELECT id, status FROM applications WHERE post_id = $1 AND user_id = $2',
      [postId, userId],
      tx,
    );
    if (existing && existing.status !== 'withdrawn' && existing.status !== 'rejected') {
      throw conflict('Вы уже подавали заявку на эту карточку.');
    }
    if (existing) {
      await tx.query(
        `UPDATE applications
         SET status = 'pending', message = $2, created_at = now(), decided_at = NULL
         WHERE id = $1`,
        [existing.id, input.message],
      );
      return { id: existing.id };
    }

    const id = newId();
    await tx.query(
      `INSERT INTO applications (id, post_id, role_id, user_id, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, postId, input.roleId, userId, input.message],
    );
    await createNotification(tx, {
      userId: post.authorId,
      type: 'application',
      actorId: userId,
      entityType: 'application',
      entityId: id,
      postId,
      payload: { roleId: input.roleId },
    });
    return { id };
}

/**
 * Решение по заявке. Принятие проверяет свободные места ВНУТРИ транзакции
 * с блокировкой роли — параллельные принятия не превысят лимит.
 */
export async function decideApplication(
  applicationId: string,
  actorId: string,
  actorRole: 'user' | 'moderator' | 'admin',
  decision: 'accept' | 'reject',
  db: Queryable,
): Promise<{ status: string; filled: number }> {
  const tx = db;
    const app = await one<{
      id: string;
      post_id: string;
      role_id: string;
      user_id: string;
      status: string;
      author_id: string;
    }>(
      `SELECT a.id, a.post_id, a.role_id, a.user_id, a.status, p.author_id
       FROM applications a JOIN posts p ON p.id = a.post_id
       WHERE a.id = $1
       FOR UPDATE`,
      [applicationId],
      tx,
    );
    if (!app) throw notFound('Заявка не найдена.');
    const isMod = actorRole === 'admin' || actorRole === 'moderator';
    if (app.author_id !== actorId && !isMod) throw forbidden('Решение принимает автор карточки.');
    if (app.status !== 'pending') throw conflict('Заявка уже обработана.');

    if (decision === 'reject') {
      await tx.query(
        "UPDATE applications SET status = 'rejected', decided_by = $2, decided_at = now() WHERE id = $1",
        [applicationId, actorId],
      );
      await createNotification(tx, {
        userId: app.user_id,
        type: 'application_result',
        actorId,
        entityType: 'application',
        entityId: applicationId,
        postId: app.post_id,
        payload: { status: 'rejected' },
      });
      const role = await one<{ filled: number }>(
        'SELECT filled FROM project_roles WHERE id = $1',
        [app.role_id],
        tx,
      );
      return { status: 'rejected', filled: Number(role?.filled ?? 0) };
    }

    // Блокируем роль и проверяем места в той же транзакции.
    const role = await one<{ capacity: number; filled: number }>(
      'SELECT capacity, filled FROM project_roles WHERE id = $1 FOR UPDATE',
      [app.role_id],
      tx,
    );
    if (!role) throw badRequest('Роль не найдена.');
    if (role.filled >= role.capacity) {
      throw conflict('Свободных мест больше нет — заявка не может быть принята.');
    }

    await tx.query(
      "UPDATE applications SET status = 'accepted', decided_by = $2, decided_at = now() WHERE id = $1",
      [applicationId, actorId],
    );
    await tx.query('UPDATE project_roles SET filled = filled + 1 WHERE id = $1 AND filled < capacity', [
      app.role_id,
    ]);
    const updated = await one<{ filled: number }>(
      'SELECT filled FROM project_roles WHERE id = $1',
      [app.role_id],
      tx,
    );
    const filled = Number(updated?.filled ?? role.filled);
    if (filled <= role.filled) {
      // Гонка: место исчезло между проверками — откатываем принятие.
      throw conflict('Свободных мест больше нет — заявка не может быть принята.');
    }

    await createNotification(tx, {
      userId: app.user_id,
      type: 'application_result',
      actorId,
      entityType: 'application',
      entityId: applicationId,
      postId: app.post_id,
      payload: { status: 'accepted' },
    });
    return { status: 'accepted', filled };
}

export async function withdrawApplication(
  userId: string,
  applicationId: string,
  db: Queryable,
): Promise<{ status: string }> {
  const tx = db;
    const app = await one<{ user_id: string; status: string; role_id: string }>(
      'SELECT user_id, status, role_id FROM applications WHERE id = $1 FOR UPDATE',
      [applicationId],
      tx,
    );
    if (!app) throw notFound('Заявка не найдена.');
    if (app.user_id !== userId) throw forbidden('Это не ваша заявка.');
    if (app.status === 'accepted') {
      throw conflict('Принятую заявку нельзя отозвать — обратитесь к автору карточки.');
    }
    if (app.status === 'withdrawn') return { status: 'withdrawn' };
    await tx.query(
      "UPDATE applications SET status = 'withdrawn', decided_at = now() WHERE id = $1",
      [applicationId],
    );
    return { status: 'withdrawn' };
}

// ————— Событие —————

export async function attendEvent(
  userId: string,
  postId: string,
  status: 'going' | 'maybe',
  db: Queryable,
): Promise<{ goingCount: number; viewerStatus: 'going' | 'maybe' | null }> {
  const tx = db;
    const event = await one<{ capacity: number | null; going_count: number; author_id: string }>(
      `SELECT e.capacity, e.going_count, p.author_id
       FROM events e JOIN posts p ON p.id = e.post_id
       WHERE e.post_id = $1 FOR UPDATE`,
      [postId],
      tx,
    );
    if (!event) throw notFound('Событие не найдено.');

    const existing = await one<{ status: string }>(
      'SELECT status FROM event_attendees WHERE event_id = $1 AND user_id = $2',
      [postId, userId],
      tx,
    );

    if (status === 'going' && !existing && event.capacity !== null) {
      if (event.going_count >= event.capacity) throw conflict('Все места на событии заняты.');
    }

    await tx.query(
      `INSERT INTO event_attendees (event_id, user_id, status) VALUES ($1, $2, $3)
       ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status`,
      [postId, userId, status],
    );
    await tx.query(
      `UPDATE events SET going_count = (
         SELECT count(*) FROM event_attendees WHERE event_id = $1 AND status = 'going'
       ) WHERE post_id = $1`,
      [postId],
    );
    const updated = await one<{ going_count: number }>(
      'SELECT going_count FROM events WHERE post_id = $1',
      [postId],
      tx,
    );
    if (status === 'going' && !existing) {
      await createNotification(tx, {
        userId: event.author_id,
        type: 'system',
        actorId: userId,
        entityType: 'event',
        entityId: postId,
        postId,
        payload: { action: 'attend' },
      });
    }
    return { goingCount: Number(updated?.going_count ?? 0), viewerStatus: status };
}

// ————— Цель —————

export async function updateGoalProgress(
  userId: string,
  postId: string,
  currentValue: number,
  db: Queryable,
): Promise<{ currentValue: number; percent: number }> {
  const post = await one<{ author_id: string; type: string }>(
    'SELECT author_id, type FROM posts WHERE id = $1',
    [postId],
    db,
  );
  if (!post) throw notFound('Публикация не найдена.');
  if (post.type !== 'goal') throw badRequest('Это не цель.');
  if (post.author_id !== userId) throw forbidden('Прогресс обновляет автор цели.');

  const goal = await one<{ target_value: number | string }>(
    'SELECT target_value FROM goals WHERE post_id = $1',
    [postId],
    db,
  );
  if (!goal) throw notFound('Цель не найдена.');
  const target = Number(goal.target_value);
  if (currentValue < 0 || currentValue > 1_000_000_000) throw badRequest('Недопустимое значение.');

  await db.query('UPDATE goals SET current_value = $2 WHERE post_id = $1', [postId, currentValue]);
  const percent = target > 0 ? Math.max(0, Math.min(100, Math.round((currentValue / target) * 100))) : 0;
  return { currentValue, percent };
}

export async function toggleMilestone(
  userId: string,
  postId: string,
  milestoneId: string,
  isDone: boolean,
  db: Queryable,
): Promise<{ isDone: boolean }> {
  const post = await one<{ author_id: string }>('SELECT author_id FROM posts WHERE id = $1', [postId], db);
  if (!post) throw notFound('Публикация не найдена.');
  if (post.author_id !== userId) throw forbidden('Этапы меняет автор цели.');
  const updated = await one<{ id: string }>(
    'UPDATE goal_milestones SET is_done = $3, updated_at = now() WHERE id = $1 AND goal_id = $2 RETURNING id',
    [milestoneId, postId, isDone],
    db,
  );
  if (!updated) throw notFound('Этап не найден.');
  return { isDone };
}

// ————— Совместный чек-лист —————

async function canEditChecklist(
  userId: string,
  postId: string,
  db: Queryable,
): Promise<boolean> {
  const row = await one<{ author_id: string; type: string; status: string }>(
    'SELECT author_id, type, status FROM posts WHERE id = $1',
    [postId],
    db,
  );
  if (!row || row.type !== 'checklist') return false;
  if (row.status === 'removed') return false;
  if (row.author_id === userId) return true;
  const collaborator = await one<{ user_id: string }>(
    "SELECT user_id FROM post_collaborators WHERE post_id = $1 AND user_id = $2 AND permission = 'edit'",
    [postId, userId],
    db,
  );
  return Boolean(collaborator);
}

export async function addChecklistItem(
  userId: string,
  postId: string,
  text: string,
  db: Queryable,
): Promise<{ id: string }> {
  if (!(await canEditChecklist(userId, postId, db))) throw forbidden('Нет доступа к списку.');
  const count = await one<{ count: string }>(
    'SELECT count(*) AS count FROM checklist_items WHERE post_id = $1',
    [postId],
    db,
  );
  if (Number(count?.count ?? 0) >= 100) throw conflict('В списке уже 100 задач.');
  const positionRow = await one<{ max: number | null }>(
    'SELECT max(position) AS max FROM checklist_items WHERE post_id = $1',
    [postId],
    db,
  );
  const id = newId();
  await db.query(
    `INSERT INTO checklist_items (id, post_id, text, position, updated_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, postId, text, Number(positionRow?.max ?? -1) + 1, userId],
  );
  return { id };
}

export async function updateChecklistItem(
  userId: string,
  itemId: string,
  input: { text?: string; isDone?: boolean; position?: number },
  db: Queryable,
): Promise<{ id: string }> {
  const item = await one<{ id: string; post_id: string }>(
    'SELECT id, post_id FROM checklist_items WHERE id = $1',
    [itemId],
    db,
  );
  if (!item) throw notFound('Задача не найдена.');
  if (!(await canEditChecklist(userId, item.post_id, db))) throw forbidden('Нет доступа к списку.');

  const sets: string[] = [];
  const params: unknown[] = [itemId];
  if (input.text !== undefined) {
    params.push(input.text);
    sets.push(`text = $${params.length}`);
  }
  if (input.isDone !== undefined) {
    params.push(input.isDone);
    sets.push(`is_done = $${params.length}`);
  }
  if (input.position !== undefined) {
    params.push(input.position);
    sets.push(`position = $${params.length}`);
  }
  if (sets.length === 0) return { id: itemId };
  sets.push('updated_at = now()');
  params.push(userId);
  sets.push(`updated_by = $${params.length}`);
  await db.query(`UPDATE checklist_items SET ${sets.join(', ')} WHERE id = $1`, params);

  // Достижение за полное выполнение списка (идемпотентно).
  if (input.isDone === true) {
    const progress = await one<{ done: string; total: string }>(
      `SELECT
         count(*) FILTER (WHERE is_done) AS done,
         count(*) AS total
       FROM checklist_items WHERE post_id = $1`,
      [item.post_id],
      db,
    );
    const done = Number(progress?.done ?? 0);
    const total = Number(progress?.total ?? 0);
    if (total > 0 && done >= total) {
      const rules = await getXpRules(db);
      await awardXp(db, {
        userId,
        kind: 'checklist_completed',
        xp: rules.checklist_completed ?? 6,
        reason: 'Чек-лист выполнен полностью',
        sourceType: 'post',
        sourceId: item.post_id,
      });
    }
  }
  return { id: itemId };
}

export async function deleteChecklistItem(
  userId: string,
  itemId: string,
  db: Queryable,
): Promise<void> {
  const item = await one<{ id: string; post_id: string }>(
    'SELECT id, post_id FROM checklist_items WHERE id = $1',
    [itemId],
    db,
  );
  if (!item) throw notFound('Задача не найдена.');
  if (!(await canEditChecklist(userId, item.post_id, db))) throw forbidden('Нет доступа к списку.');
  await db.query('DELETE FROM checklist_items WHERE id = $1', [itemId]);
}

export async function setCollaborator(
  ownerId: string,
  postId: string,
  username: string,
  permission: 'edit' | 'view' | null,
  db: Queryable,
): Promise<void> {
  const post = await one<{ author_id: string; type: string }>(
    'SELECT author_id, type FROM posts WHERE id = $1',
    [postId],
    db,
  );
  if (!post) throw notFound('Публикация не найдена.');
  if (post.author_id !== ownerId) throw forbidden('Сотрудников добавляет автор.');
  if (post.type !== 'checklist') throw badRequest('Совместное редактирование доступно для чек-листов.');

  const target = await one<{ id: string }>(
    'SELECT id FROM users WHERE username_lower = $1',
    [username.toLowerCase()],
    db,
  );
  if (!target) throw notFound('Пользователь не найден.');
  if (target.id === ownerId) throw badRequest('Вы и так автор списка.');

  if (permission === null) {
    await db.query('DELETE FROM post_collaborators WHERE post_id = $1 AND user_id = $2', [
      postId,
      target.id,
    ]);
    return;
  }
  await db.query(
    `INSERT INTO post_collaborators (post_id, user_id, permission) VALUES ($1, $2, $3)
     ON CONFLICT (post_id, user_id) DO UPDATE SET permission = EXCLUDED.permission`,
    [postId, target.id, permission],
  );
}
