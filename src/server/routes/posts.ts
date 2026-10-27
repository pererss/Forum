// Маршруты публикаций: лента, CRUD, избранное, комментарии, реакции, жалобы, фильтры.

import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool';
import { one, withTransaction } from '../db/sql';
import { newId } from '../lib/ids';
import { attachSession, requireActiveUser, requireUser } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import {
  commentSchema,
  createPostSchema,
  feedQuerySchema,
  reactionSchema,
  reportSchema,
  savedFilterSchema,
  updateCommentSchema,
  updatePostSchema,
  applicationSchema,
  attendEventSchema,
  checklistItemSchema,
  checklistItemUpdateSchema,
  collaboratorSchema,
  goalProgressSchema,
} from '../../shared/schemas';
import {
  createPost,
  deleteFilter,
  getPost,
  hideFromFeed,
  listPosts,
  listSavedFilters,
  publishPost,
  removePost,
  saveFilter,
  setFavorite,
  setWatch,
  unhideFromFeed,
  updatePost,
} from '../services/posts';
import {
  createComment,
  deleteComment,
  listComments,
  setAcceptedAnswer,
  updateComment,
} from '../services/comments';
import { setReaction } from '../services/reactions';
import {
  addChecklistItem,
  applyToTeam,
  attendEvent,
  deleteChecklistItem,
  setCollaborator,
  toggleMilestone,
  updateChecklistItem,
  updateGoalProgress,
  votePoll,
} from '../services/type-actions';

export const postsRouter: Router = Router();

const idParam = z.string().trim().min(1).max(64);

function param(req: { params: Record<string, unknown> }, name: string): string {
  const value = req.params[name];
  return typeof value === 'string' ? value : String(value ?? '');
}

// ————— Лента —————

postsRouter.get('/', attachSession, async (req, res) => {
  const query = feedQuerySchema.parse(req.query);
  const result = await listPosts(query, req.user ?? null, getPool());
  res.json(result);
});

// ————— Сохранённые фильтры —————

postsRouter.get('/saved-filters', attachSession, async (req, res) => {
  const viewer = requireUser(req);
  res.json({ items: await listSavedFilters(viewer.id, getPool()) });
});

postsRouter.post(
  '/saved-filters',
  attachSession,
  rateLimit({ name: 'saved-filter', windowMs: 60_000, max: 30 }),
  async (req, res) => {
    const viewer = requireActiveUser(req);
    const input = savedFilterSchema.parse(req.body);
    const created = await withTransaction((db) => saveFilter(viewer.id, input.name, input.query, db));
    res.status(201).json(created);
  },
);

postsRouter.delete('/saved-filters/:id', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  await withTransaction((db) => deleteFilter(viewer.id, id, db));
  res.json({ ok: true });
});

// ————— Создание —————

postsRouter.post(
  '/',
  attachSession,
  rateLimit({
    name: 'create-post',
    windowMs: 60_000,
    max: 10,
    message: 'Слишком много публикаций. Подождите минуту.',
  }),
  async (req, res) => {
    const viewer = requireActiveUser(req);
    const input = createPostSchema.parse(req.body);
    const id = await withTransaction((db) => createPost(viewer.id, input, db));
    res.status(201).json({ id });
  },
);

// ————— Детальная страница —————

postsRouter.get('/:id', attachSession, async (req, res) => {
  const id = idParam.parse(param(req, 'id'));
  const post = await getPost(id, req.user ?? null, getPool());
  res.json({ post });
});

// ————— Обновление / публикация / удаление —————

postsRouter.patch('/:id', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  const input = updatePostSchema.parse(req.body);
  await withTransaction((db) => updatePost(id, viewer, input, db));
  const post = await getPost(id, viewer, getPool());
  res.json({ post });
});

postsRouter.post('/:id/publish', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  await withTransaction((db) => publishPost(id, viewer, db));
  res.json({ ok: true });
});

postsRouter.delete('/:id', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  await withTransaction((db) => removePost(id, viewer, db));
  res.json({ ok: true });
});

// ————— Избранное и наблюдение —————

postsRouter.post('/:id/favorite', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  const body = z.object({ on: z.boolean().default(true) }).parse(req.body ?? {});
  const result = await withTransaction((db) => setFavorite(viewer.id, id, body.on, db));
  res.json(result);
});

postsRouter.post('/:id/watch', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  const body = z.object({ on: z.boolean().default(true) }).parse(req.body ?? {});
  const result = await withTransaction((db) => setWatch(viewer.id, id, body.on, db));
  res.json(result);
});

// ————— Скрытие из своей ленты —————

postsRouter.post(
  '/:id/hide',
  attachSession,
  rateLimit({ name: 'hide', windowMs: 60_000, max: 60 }),
  async (req, res) => {
    const viewer = requireActiveUser(req);
    const id = idParam.parse(param(req, 'id'));
    const body = z
      .object({ targetType: z.enum(['post', 'author', 'category']).default('post'), targetId: z.string().max(64) })
      .parse(req.body ?? {});
    const targetId = body.targetType === 'post' ? id : body.targetId;
    if (body.targetType === 'author' && targetId === viewer.id) {
      res.status(400).json({ error: { message: 'Нельзя скрыть собственный профиль.' } });
      return;
    }
    if (body.targetType === 'post') {
      const author = await one<{ author_id: string }>('SELECT author_id FROM posts WHERE id = $1', [id]);
      if (author?.author_id === viewer.id) {
        res.status(400).json({ error: { message: 'Свою публикацию скрывать не нужно.' } });
        return;
      }
    }
    await withTransaction((db) => hideFromFeed(viewer.id, body.targetType, targetId, db));
    res.json({ ok: true });
  },
);

postsRouter.delete('/:id/hide', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  const body = z
    .object({ targetType: z.enum(['post', 'author', 'category']).default('post'), targetId: z.string().max(64) })
    .parse(req.query ?? {});
  const targetId = body.targetType === 'post' ? id : body.targetId;
  await withTransaction((db) => unhideFromFeed(viewer.id, body.targetType, targetId, db));
  res.json({ ok: true });
});

// ————— Жалоба —————

postsRouter.post(
  '/:id/report',
  attachSession,
  rateLimit({ name: 'report', windowMs: 60_000, max: 10 }),
  async (req, res) => {
    const viewer = requireActiveUser(req);
    const id = idParam.parse(param(req, 'id'));
    const input = reportSchema.parse({ ...req.body, targetType: 'post', targetId: id });
    const created = await one<{ id: string }>(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (reporter_id, target_type, target_id)
         DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details, status = 'open'
       RETURNING id`,
      [newId(), viewer.id, input.targetType, input.targetId, input.reason, input.details ?? null],
      getPool(),
    );
    res.status(201).json({ id: created?.id });
  },
);

// ————— Действия структурированных типов —————

postsRouter.post('/:id/poll/vote', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  const input = z.object({ optionId: z.string().min(1).max(64) }).parse(req.body);
  const result = await withTransaction((db) => votePoll(viewer.id, id, input.optionId, db));
  res.json(result);
});

postsRouter.post(
  '/:id/apply',
  attachSession,
  rateLimit({ name: 'apply', windowMs: 60_000, max: 15 }),
  async (req, res) => {
    const viewer = requireActiveUser(req);
    const id = idParam.parse(param(req, 'id'));
    const input = applicationSchema.parse(req.body);
    const result = await withTransaction((db) =>
      applyToTeam(viewer.id, id, { roleId: input.roleId, message: input.message }, db),
    );
    res.status(201).json(result);
  },
);

postsRouter.post('/:id/attend', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  const input = attendEventSchema.parse(req.body);
  const result = await withTransaction((db) => attendEvent(viewer.id, id, input.status, db));
  res.json(result);
});

postsRouter.patch('/:id/goal', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  const input = goalProgressSchema.parse(req.body);
  const result = await withTransaction((db) =>
    updateGoalProgress(viewer.id, id, input.currentValue, db),
  );
  res.json(result);
});

postsRouter.post('/:id/milestones/:milestoneId', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  const milestoneId = idParam.parse(param(req, 'milestoneId'));
  const input = z.object({ isDone: z.boolean().default(true) }).parse(req.body ?? {});
  const result = await withTransaction((db) =>
    toggleMilestone(viewer.id, id, milestoneId, input.isDone, db),
  );
  res.json(result);
});

// ————— Чек-лист —————

postsRouter.get('/:id/items', attachSession, async (req, res) => {
  const id = idParam.parse(param(req, 'id'));
  const post = await getPost(id, req.user ?? null, getPool());
  res.json({ checklist: post.typeData.checklist ?? null });
});

postsRouter.post(
  '/:id/items',
  attachSession,
  rateLimit({ name: 'checklist-add', windowMs: 60_000, max: 60 }),
  async (req, res) => {
    const viewer = requireActiveUser(req);
    const id = idParam.parse(param(req, 'id'));
    const input = checklistItemSchema.parse(req.body);
    const result = await withTransaction((db) => addChecklistItem(viewer.id, id, input.text, db));
    res.status(201).json(result);
  },
);

postsRouter.patch('/:id/items/:itemId', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const itemId = idParam.parse(param(req, 'itemId'));
  const input = checklistItemUpdateSchema.parse(req.body);
  const result = await withTransaction((db) => updateChecklistItem(viewer.id, itemId, input, db));
  res.json(result);
});

postsRouter.delete('/:id/items/:itemId', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const itemId = idParam.parse(param(req, 'itemId'));
  await withTransaction((db) => deleteChecklistItem(viewer.id, itemId, db));
  res.json({ ok: true });
});

postsRouter.post('/:id/collaborators', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  const input = collaboratorSchema.parse(req.body);
  await withTransaction((db) =>
    setCollaborator(viewer.id, id, input.username, input.permission, db),
  );
  res.json({ ok: true });
});

postsRouter.delete('/:id/collaborators/:username', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  const username = z.string().min(1).max(30).parse(param(req, 'username'));
  await withTransaction((db) => setCollaborator(viewer.id, id, username, null, db));
  res.json({ ok: true });
});

// ————— Комментарии —————

postsRouter.get('/:id/comments', attachSession, async (req, res) => {
  const id = idParam.parse(param(req, 'id'));
  const sort = z.enum(['old', 'new', 'top']).default('old').parse(req.query.sort ?? 'old');
  const items = await listComments(id, req.user ?? null, sort, getPool());
  res.json({ items });
});

postsRouter.post(
  '/:id/comments',
  attachSession,
  rateLimit({
    name: 'create-comment',
    windowMs: 60_000,
    max: 30,
    message: 'Слишком много комментариев. Подождите минуту.',
  }),
  async (req, res) => {
    const viewer = requireActiveUser(req);
    const id = idParam.parse(param(req, 'id'));
    const input = commentSchema.parse(req.body);
    const comment = await withTransaction((db) =>
      createComment(viewer, id, { body: input.body, parentId: input.parentId ?? null }, db),
    );
    res.status(201).json({ comment });
  },
);

// ————— Глобальные операции с комментариями —————

export const commentsRouter: Router = Router();

commentsRouter.patch('/:id', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  const input = updateCommentSchema.parse(req.body);
  await withTransaction((db) => updateComment(id, viewer, input.body, db));
  res.json({ ok: true });
});

commentsRouter.delete('/:id', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  await withTransaction((db) => deleteComment(id, viewer, db));
  res.json({ ok: true });
});

commentsRouter.post('/:id/accept', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam.parse(param(req, 'id'));
  const body = z.object({ accept: z.boolean().default(true) }).parse(req.body ?? {});
  const result = await withTransaction((db) => setAcceptedAnswer(id, viewer, body.accept, db));
  res.json(result);
});

// ————— Реакции —————

export const reactionsRouter: Router = Router();

reactionsRouter.post(
  '/',
  attachSession,
  rateLimit({ name: 'react', windowMs: 60_000, max: 120 }),
  async (req, res) => {
    const viewer = requireActiveUser(req);
    const input = reactionSchema.parse(req.body);
    const result = await withTransaction((db) =>
      setReaction(viewer.id, input.targetType, input.targetId, input.value, db),
    );
    res.json(result);
  },
);
