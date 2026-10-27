// Интеграционные тесты API против реальной PostgreSQL-совместимой базы.
// ВАЖНО: работают ТОЛЬКО в отдельной схеме nuffy_test (см. vitest.config.ts),
// которую тест пересоздаёт перед запуском. Публичная схема не затрагивается.

import type { Server } from 'node:http';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// env загружается из .env.local; DATABASE_SCHEMA=nuffy_test задан в vitest.config.ts.
import { createApp } from '../src/server/app';
import { ensureDbReady } from '../src/server/db/ready';
import { closePool, getPool } from '../src/server/db/pool';
import { env, requireDatabaseUrl } from '../src/server/env';

const { Client } = pg;

let server: Server;
let baseUrl = '';
let suffix = '';

type Agent = ReturnType<typeof request.agent>;

/** Новый клиент = отдельная cookie-сессия. */
function user(_name?: string): Agent {
  return request.agent(baseUrl);
}

async function devLogin(agent: Agent, username: string): Promise<void> {
  const res = await agent.post('/api/auth/dev-login').send({ username });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

async function createPost(
  agent: Agent,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await agent.post('/api/posts').send(payload);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string };
}

beforeAll(async () => {
  // Чистим только тестовую схему — это безопасно и не затрагивает public.
  const admin = new Client({
    connectionString: requireDatabaseUrl(),
    ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  });
  await admin.connect();
  await admin.query('DROP SCHEMA IF EXISTS nuffy_test CASCADE');
  await admin.end();

  // ensureDbReady создаёт схему и применяет все миграции.
  expect(await ensureDbReady()).toBe(true);

  const app = createApp();
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Не удалось определить порт тестового сервера.');
  baseUrl = `http://127.0.0.1:${address.port}`;
  suffix = `t${Date.now().toString(36)}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool().catch(() => {});
});

describe('базовая доступность и безопасность', () => {
  it('health и meta отвечают без секретов', async () => {
    const health = await request(baseUrl).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.ok).toBe(true);

    const meta = await request(baseUrl).get('/api/meta');
    expect(meta.status).toBe(200);
    expect(JSON.stringify(meta.body)).not.toContain(env.databaseUrl ? new URL(env.databaseUrl).password : 'никогда');
  });

  it('неизвестный API-маршрут отдаёт JSON 404', async () => {
    const res = await request(baseUrl).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('аноним не может создать публикацию', async () => {
    const res = await request(baseUrl).post('/api/posts').send({ type: 'discussion', title: 'x', body: 'y' });
    expect(res.status).toBe(401);
  });

  it('Google OAuth честно сообщает, что не настроен', async () => {
    const status = await request(baseUrl).get('/api/auth/google/status');
    expect(status.body.configured).toBe(false);
    expect(status.body.message).toContain('не настроен');

    const start = await request(baseUrl).get('/api/auth/google');
    expect(start.status).toBe(503);
    expect(start.body.error.code).toBe('oauth_not_configured');
  });

  it('валидация отклоняет пустой пост', async () => {
    const agent = user(`owner_${suffix}`);
    await devLogin(agent, `owner_${suffix}`);
    const res = await agent.post('/api/posts').send({ type: 'discussion', title: 'a', body: '' });
    expect(res.status).toBe(400);
  });
});

describe('аккаунты и профиль', () => {
  it('повторный тестовый вход возвращает тот же профиль', async () => {
    const name = `stable_${suffix}`;
    const first = user(name);
    await devLogin(first, name);
    const session1 = await first.get('/api/auth/session');
    const id1 = session1.body.user.id;

    const second = user(name);
    await devLogin(second, name);
    const session2 = await second.get('/api/auth/session');
    expect(session2.body.user.id).toBe(id1);
    expect(session2.body.user.username).toBe(name);
  });

  it('профиль сохраняет имя, био и интересы; приватность применяется на сервере', async () => {
    const owner = user(`profile_${suffix}`);
    await devLogin(owner, `profile_${suffix}`);

    const patch = await owner.patch('/api/users/me').send({
      displayName: 'Профиль Тестовый',
      bio: 'Биография для проверки.',
      interests: ['testtag'],
      settings: { privacy: { showActivity: false, showFollowing: false } },
    });
    expect(patch.status).toBe(200);
    expect(patch.body.profile.bio).toBe('Биография для проверки.');

    const self = await owner.get(`/api/users/profile_${suffix}`);
    expect(self.body.profile.bio).toBe('Биография для проверки.');
    expect(self.body.profile.counts).not.toBeNull();

    const guest = user(`guest_${suffix}`);
    await devLogin(guest, `guest_${suffix}`);
    const foreign = await guest.get(`/api/users/profile_${suffix}`);
    // Сервер не отдаёт чужие счётчики: каждое поле приходит как null.
    expect(foreign.body.profile.counts).toEqual({
      posts: null,
      comments: null,
      followers: null,
      following: null,
    });
    expect(JSON.stringify(foreign.body)).not.toContain('settings');
  });
});

describe('публикации, лента и комментарии', () => {
  let postId = '';

  it('создаёт публикацию, теги дедуплицируются по регистру', async () => {
    const author = user(`author_${suffix}`);
    await devLogin(author, `author_${suffix}`);
    const post = await createPost(author, {
      type: 'discussion',
      title: `Тестовое обсуждение ${suffix}`,
      body: 'Текст публикации для проверки.',
      tags: ['ТестовыйТег', 'testtag', 'test-tag'],
      status: 'published',
    });
    postId = post.id;

    const detail = await author.get(`/api/posts/${postId}`);
    expect(detail.status).toBe(200);
    const slugs = detail.body.post.tags.map((t: { slug: string }) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('лента отдаёт публикацию и режимы без перезагрузки', async () => {
    for (const mode of ['new', 'popular', 'for-you', 'following']) {
      const feed = await request(baseUrl).get(`/api/posts?mode=${mode}&pageSize=10`);
      expect(feed.status).toBe(200);
      expect(Array.isArray(feed.body.items)).toBe(true);
    }
  });

  it('черновик публикуется и становится доступен', async () => {
    const author = user(`drafter_${suffix}`);
    await devLogin(author, `drafter_${suffix}`);
    const draft = await createPost(author, {
      type: 'discussion',
      title: `Черновик ${suffix}`,
      body: 'Черновик.',
      status: 'draft',
    });
    const before = await author.get(`/api/posts/${draft.id}`);
    expect(before.body.post.status).toBe('draft');
    const pub = await author.post(`/api/posts/${draft.id}/publish`);
    expect(pub.status).toBe(200);
    const after = await author.get(`/api/posts/${draft.id}`);
    expect(after.body.post.status).toBe('published');
  });

  it('комментарии: ответ, редактирование, запрет чужой правки', async () => {
    const reader = user(`reader_${suffix}`);
    await devLogin(reader, `reader_${suffix}`);
    const author = user(`author_${suffix}`);
    await devLogin(author, `author_${suffix}`);

    const first = await reader.post(`/api/posts/${postId}/comments`).send({ body: 'Первый комментарий.' });
    expect(first.status).toBe(201);
    const commentId = first.body.comment.id as string;

    const reply = await author
      .post(`/api/posts/${postId}/comments`)
      .send({ body: 'Ответ.', parentId: commentId });
    expect(reply.status).toBe(201);
    expect(reply.body.comment.parentId).toBe(commentId);

    const edit = await reader.patch(`/api/comments/${commentId}`).send({ body: 'Исправленный.' });
    expect(edit.status).toBe(200);

    const foreign = await author.patch(`/api/comments/${commentId}`).send({ body: 'Чужая правка.' });
    expect(foreign.status).toBe(403);
  });

  it('вопрос: принятый ответ только автором', async () => {
    const author = user(`asker_${suffix}`);
    await devLogin(author, `asker_${suffix}`);
    const question = await createPost(author, {
      type: 'question',
      title: `Вопрос ${suffix}`,
      body: 'Как это работает?',
      status: 'published',
    });
    const reader = user(`answerer_${suffix}`);
    await devLogin(reader, `answerer_${suffix}`);
    const answer = await reader
      .post(`/api/posts/${question.id}/comments`)
      .send({ body: 'Вот так.' });
    expect(answer.status).toBe(201);

    const foreign = await reader
      .post(`/api/comments/${answer.body.comment.id}/accept`)
      .send({ accept: true });
    expect(foreign.status).toBe(403);

    const accept = await author
      .post(`/api/comments/${answer.body.comment.id}/accept`)
      .send({ accept: true });
    expect(accept.status).toBe(200);
  });

  it('реакции: одна на пользователя, переключение и снятие', async () => {
    const reader = user(`reactor_${suffix}`);
    await devLogin(reader, `reactor_${suffix}`);

    const like = await reader
      .post('/api/reactions')
      .send({ targetType: 'post', targetId: postId, value: 1 });
    expect(like.body).toMatchObject({ myReaction: 1, score: 1 });

    const unlike = await reader
      .post('/api/reactions')
      .send({ targetType: 'post', targetId: postId, value: 1 });
    expect(unlike.body).toMatchObject({ myReaction: null, score: 0 });

    const dislike = await reader
      .post('/api/reactions')
      .send({ targetType: 'post', targetId: postId, value: -1 });
    expect(dislike.body).toMatchObject({ myReaction: -1, score: -1 });

    const switched = await reader
      .post('/api/reactions')
      .send({ targetType: 'post', targetId: postId, value: 1 });
    expect(switched.body).toMatchObject({ myReaction: 1, score: 1 });
  });

  it('избранное сохраняется', async () => {
    const reader = user(`fav_${suffix}`);
    await devLogin(reader, `fav_${suffix}`);
    const on = await reader.post(`/api/posts/${postId}/favorite`).send({ on: true });
    expect(on.body.favorited).toBe(true);
    const detail = await reader.get(`/api/posts/${postId}`);
    expect(detail.body.post.viewer.favorited).toBe(true);
    const list = await reader.get('/api/posts?favorite=true');
    expect(list.body.items.some((p: { id: string }) => p.id === postId)).toBe(true);
    const off = await reader.post(`/api/posts/${postId}/favorite`).send({ on: false });
    expect(off.body.favorited).toBe(false);
  });
});

describe('форматы с собственными правилами', () => {
  it('опрос: один голос, результаты по правилам', async () => {
    const author = user(`poll_${suffix}`);
    await devLogin(author, `poll_${suffix}`);
    const poll = await createPost(author, {
      type: 'poll',
      title: `Опрос ${suffix}`,
      body: 'Голосуйте.',
      status: 'published',
      typeData: { options: ['Первый', 'Второй'], showResultsAfterVote: true },
    });

    const reader = user(`voter_${suffix}`);
    await devLogin(reader, `voter_${suffix}`);
    const before = await reader.get(`/api/posts/${poll.id}`);
    expect(before.body.post.typeData.poll.resultsVisible).toBe(false);
    const options = before.body.post.typeData.poll.options;

    const vote = await reader
      .post(`/api/posts/${poll.id}/poll/vote`)
      .send({ optionId: options[0].id });
    expect(vote.status).toBe(200);

    const again = await reader
      .post(`/api/posts/${poll.id}/poll/vote`)
      .send({ optionId: options[1].id });
    expect(again.status).toBe(409);

    const after = await reader.get(`/api/posts/${poll.id}`);
    expect(after.body.post.typeData.poll.myVote).toBe(options[0].id);
    expect(after.body.post.typeData.poll.resultsVisible).toBe(true);
    expect(after.body.post.typeData.poll.totalVotes).toBe(1);
  });

  it('команда: заявка и лимит мест не превышается', async () => {
    const owner = user(`team_${suffix}`);
    await devLogin(owner, `team_${suffix}`);
    const team = await createPost(owner, {
      type: 'team',
      title: `Команда ${suffix}`,
      body: 'Ищем человека.',
      status: 'published',
      typeData: { roles: [{ name: 'Разработчик', capacity: 1 }] },
    });
    const detail = await owner.get(`/api/posts/${team.id}`);
    const role = detail.body.post.typeData.team.roles[0];
    expect(role.openSeats).toBe(1);

    const first = user(`cand1_${suffix}`);
    await devLogin(first, `cand1_${suffix}`);
    const app1 = await first
      .post(`/api/posts/${team.id}/apply`)
      .send({ roleId: role.id, message: 'Хочу в команду.' });
    expect(app1.status).toBe(201);
    const accept = await owner
      .post(`/api/applications/${app1.body.id}/decision`)
      .send({ decision: 'accept' });
    expect(accept.status).toBe(200);

    const second = user(`cand2_${suffix}`);
    await devLogin(second, `cand2_${suffix}`);
    const app2 = await second
      .post(`/api/posts/${team.id}/apply`)
      .send({ roleId: role.id, message: 'Тоже хочу.' });
    const overflow = await owner
      .post(`/api/applications/${app2.body.id}/decision`)
      .send({ decision: 'accept' });
    expect(overflow.status).toBe(409);
  });

  it('событие: участие учитывается', async () => {
    const owner = user(`event_${suffix}`);
    await devLogin(owner, `event_${suffix}`);
    const event = await createPost(owner, {
      type: 'event',
      title: `Событие ${suffix}`,
      body: 'Встреча.',
      status: 'published',
      typeData: {
        startsAt: '2030-01-15T18:00:00.000Z',
        format: 'offline',
        location: 'Москва',
      },
    });
    const guest = user(`attendee_${suffix}`);
    await devLogin(guest, `attendee_${suffix}`);
    const attend = await guest.post(`/api/posts/${event.id}/attend`).send({ status: 'going' });
    expect(attend.status).toBe(200);
    expect(attend.body.goingCount).toBe(1);
  });

  it('отключённый администратором формат нельзя создать', async () => {
    const author = user(`disabled_${suffix}`);
    await devLogin(author, `disabled_${suffix}`);
    await getPool().query("UPDATE post_type_settings SET is_enabled = false WHERE type = 'checklist'");
    try {
      const res = await author.post('/api/posts').send({
        type: 'checklist',
        title: `Чек-лист ${suffix}`,
        body: 'Пункты.',
        status: 'published',
        typeData: { items: ['Первый'] },
      });
      expect(res.status).toBe(400);
    } finally {
      await getPool().query("UPDATE post_type_settings SET is_enabled = true WHERE type = 'checklist'");
    }
  });
});

describe('уведомления и админ-панель', () => {
  it('упоминание и комментарий создают уведомления, прочтение работает', async () => {
    const author = user(`notify_${suffix}`);
    await devLogin(author, `notify_${suffix}`);
    const post = await createPost(author, {
      type: 'discussion',
      title: `Уведомления ${suffix}`,
      body: 'Текст.',
      status: 'published',
    });
    const commenter = user(`mentioner_${suffix}`);
    await devLogin(commenter, `mentioner_${suffix}`);
    await commenter
      .post(`/api/posts/${post.id}/comments`)
      .send({ body: `Привет @notify_${suffix}, посмотри.` })
      .expect(201);

    const unread = await author.get('/api/notifications?unreadOnly=true');
    expect(unread.status).toBe(200);
    expect(unread.body.items.length).toBeGreaterThan(0);

    const read = await author.post('/api/notifications/read').send({ all: true });
    expect(read.status).toBe(200);
    expect(read.body.unread).toBe(0);
  });

  it('админ-раздел закрыт для обычного пользователя и открыт администратору', async () => {
    const plain = user(`plain_${suffix}`);
    await devLogin(plain, `plain_${suffix}`);
    const denied = await plain.get('/api/admin/stats');
    expect(denied.status).toBe(403);

    const admin = user(`admin_${suffix}`);
    await devLogin(admin, `admin_${suffix}`);
    await getPool().query("UPDATE users SET role = 'admin' WHERE username = $1", [`admin_${suffix}`]);
    const stats = await admin.get('/api/admin/stats');
    expect(stats.status).toBe(200);
    expect(typeof stats.body.users).toBe('number');
    expect(Array.isArray(stats.body.recent)).toBe(true);

    const users = await admin.get('/api/admin/users?pageSize=5');
    expect(users.status).toBe(200);
    expect(users.body.items.length).toBeLessThanOrEqual(5);
    expect(JSON.stringify(stats.body)).not.toContain(env.databaseUrl ? new URL(env.databaseUrl).password : 'никогда');
  });
});
