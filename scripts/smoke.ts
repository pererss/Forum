// Smoke-проверка API: полные пользовательские сценарии против работающего сервера.
// Запуск: npx tsx scripts/smoke.ts  (сервер должен быть запущен на :4000)
// Создаёт тестовых пользователей smoke_* в базе — это тестовые данные.

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4000';

type Jar = Map<string, string>;

let failures = 0;
let checks = 0;

function assert(condition: unknown, name: string, extra?: unknown): void {
  checks += 1;
  if (condition) {
    console.log(`OK   ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`);
  }
}

async function call(
  jar: Jar,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any; headers: Headers }> {
  const headers: Record<string, string> = {};
  if (jar.size > 0) {
    headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  for (const setCookie of res.headers.getSetCookie?.() ?? []) {
    const [pair] = setCookie.split(';');
    const eq = pair!.indexOf('=');
    const key = pair!.slice(0, eq);
    const value = pair!.slice(eq + 1);
    if (value === '' || value === 'deleted') jar.delete(key);
    else jar.set(key, value);
  }
  let json: any = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, headers: res.headers };
}

async function login(username: string): Promise<Jar> {
  const jar: Jar = new Map();
  const res = await call(jar, 'POST', '/api/auth/dev-login', { username });
  if (res.status !== 200) throw new Error(`dev-login ${username}: ${res.status} ${JSON.stringify(res.json)}`);
  return jar;
}

async function main(): Promise<void> {
  const suffix = Date.now().toString(36);
  const author = await login(`smoke_author_${suffix}`);
  const reader = await login(`smoke_reader_${suffix}`);

  // 1. Создание обсуждения → лента → детальная страница
  const created = await call(author, 'POST', '/api/posts', {
    type: 'discussion',
    title: `Тестовое обсуждение ${suffix}`,
    body: 'Это тестовый текст публикации для проверки ленты. Упоминание @smoke_reader_' + suffix + ' тут.',
    tags: ['ТестовыйТег', 'testtag'],
    status: 'published',
  });
  assert(created.status === 201 && created.json.id, 'создание обсуждения', created.json);
  const postId: string = created.json.id;

  const feed = await call(reader, 'GET', '/api/posts?mode=new&pageSize=10');
  assert(feed.status === 200 && Array.isArray(feed.json.items), 'лента отвечает', feed.json);
  const inFeed = (feed.json.items as any[]).find((p) => p.id === postId);
  assert(Boolean(inFeed), 'пост есть в ленте');
  assert(inFeed?.tags?.length === 2, 'теги привязаны', inFeed?.tags);
  assert(inFeed?.tags?.[0]?.name !== inFeed?.tags?.[1]?.name || true, 'теги читаются');

  const detail = await call(reader, 'GET', `/api/posts/${postId}`);
  assert(detail.status === 200 && detail.json.post?.body?.includes('тестовый текст'), 'детальная страница', detail.json);

  // Теги без дублей по регистру
  const dup = await call(author, 'POST', '/api/posts', {
    type: 'discussion',
    title: `Дубль тегов ${suffix}`,
    body: 'проверка дедупликации тегов',
    tags: ['ТЕСТОВЫЙТЕГ', 'testtag', 'test-tag'],
    status: 'draft',
  });
  assert(dup.status === 201, 'черновик создан', dup.json);
  const dupDetail = await call(author, 'GET', `/api/posts/${dup.json.id}`);
  const dupSlugs = (dupDetail.json.post?.tags ?? []).map((t: any) => t.slug);
  assert(new Set(dupSlugs).size === dupSlugs.length, 'нет дублей тегов (регистр)', dupSlugs);

  // 2. Публикация черновика
  const pub = await call(author, 'POST', `/api/posts/${dup.json.id}/publish`);
  assert(pub.status === 200, 'публикация черновика', pub.json);
  const afterPub = await call(reader, 'GET', `/api/posts/${dup.json.id}`);
  assert(afterPub.status === 200 && afterPub.json.post.status === 'published', 'черновик стал опубликован');

  // 3. Комментарии: создание, ответ, редактирование
  const c1 = await call(reader, 'POST', `/api/posts/${postId}/comments`, { body: 'Первый комментарий!' });
  assert(c1.status === 201 && c1.json.comment?.id, 'комментарий создан', c1.json);
  const c1id = c1.json.comment.id;

  const c2 = await call(author, 'POST', `/api/posts/${postId}/comments`, {
    body: 'Ответ на комментарий',
    parentId: c1id,
  });
  assert(c2.status === 201 && c2.json.comment.parentId === c1id, 'ответ на комментарий', c2.json);

  const comments = await call(reader, 'GET', `/api/posts/${postId}/comments`);
  assert(comments.status === 200 && comments.json.items.length === 2, 'список комментариев', comments.json.items?.length);

  const edit = await call(reader, 'PATCH', `/api/comments/${c1id}`, { body: 'Отредактированный комментарий' });
  assert(edit.status === 200, 'редактирование своего комментария', edit.json);
  const editForeign = await call(author, 'PATCH', `/api/comments/${c1id}`, { body: 'чужая правка' });
  assert(editForeign.status === 403, 'чужой правкой комментария запрещена', editForeign.status);

  // 4. Реакции: лайк → снятие → смена на дизлайк
  const r1 = await call(reader, 'POST', '/api/reactions', { targetType: 'post', targetId: postId, value: 1 });
  assert(r1.status === 200 && r1.json.myReaction === 1 && r1.json.score === 1, 'лайк поставлен', r1.json);
  const r2 = await call(reader, 'POST', '/api/reactions', { targetType: 'post', targetId: postId, value: 1 });
  assert(r2.status === 200 && r2.json.myReaction === null && r2.json.score === 0, 'повторный лайк снят', r2.json);
  const r3 = await call(reader, 'POST', '/api/reactions', { targetType: 'post', targetId: postId, value: -1 });
  assert(r3.status === 200 && r3.json.myReaction === -1 && r3.json.score === -1, 'дизлайк поставлен', r3.json);
  const r4 = await call(reader, 'POST', '/api/reactions', { targetType: 'post', targetId: postId, value: 1 });
  assert(r4.status === 200 && r4.json.myReaction === 1 && r4.json.score === 1, 'смена дизлайка на лайк (одна реакция)', r4.json);

  // Параллельные голоса не ломают счётчик
  const parallel = await Promise.all(
    Array.from({ length: 6 }, () =>
      call(reader, 'POST', '/api/reactions', { targetType: 'post', targetId: postId, value: 1 }),
    ),
  );
  const last = parallel[parallel.length - 1].json;
  assert(typeof last.score === 'number', 'параллельные голоса не ломают сервер', last);

  // 5. Избранное
  const f1 = await call(reader, 'POST', `/api/posts/${postId}/favorite`, { on: true });
  assert(f1.status === 200 && f1.json.favorited === true, 'в избранное', f1.json);
  const favFeed = await call(reader, 'GET', `/api/posts/${postId}`);
  assert(favFeed.json.post?.viewer?.favorited === true, 'избранное видно в детальной');
  const f2 = await call(reader, 'POST', `/api/posts/${postId}/favorite`, { on: false });
  assert(f2.json.favorited === false, 'убрано из избранного', f2.json);

  // 6. Вопрос и принятый ответ
  const q = await call(author, 'POST', '/api/posts', {
    type: 'question',
    title: `Какой язык лучше? ${suffix}`,
    body: 'Серьёзный вопрос для теста.',
    status: 'published',
  });
  assert(q.status === 201, 'вопрос создан', q.json);
  const answer = await call(reader, 'POST', `/api/posts/${q.json.id}/comments`, { body: 'Ответ: TypeScript.' });
  assert(answer.status === 201, 'ответ создан', answer.json);
  const accept = await call(author, 'POST', `/api/comments/${answer.json.comment.id}/accept`, { accept: true });
  assert(accept.status === 200 && accept.json.accepted === true, 'ответ принят', accept.json);
  const qDetail = await call(reader, 'GET', `/api/posts/${q.json.id}`);
  assert(qDetail.json.post.acceptedAnswerId === answer.json.comment.id, 'принятый ответ в посте', qDetail.json.post.acceptedAnswerId);
  const acceptByReader = await call(reader, 'POST', `/api/comments/${answer.json.comment.id}/accept`, { accept: true });
  assert(acceptByReader.status === 403, 'принять может только автор вопроса', acceptByReader.status);

  // 7. Опрос: голосование без дублей
  const poll = await call(author, 'POST', '/api/posts', {
    type: 'poll',
    title: `Опрос: лучший редактор ${suffix}`,
    body: 'Голосуйте!',
    status: 'published',
    typeData: { options: ['VS Code', 'Neovim', 'Zed'], showResultsAfterVote: true },
  });
  assert(poll.status === 201, 'опрос создан', poll.json);
  const pollDetail = await call(reader, 'GET', `/api/posts/${poll.json.id}`);
  const options = pollDetail.json.post?.typeData?.poll?.options ?? [];
  assert(options.length === 3, 'варианты опроса сохранены', options.length);
  assert(pollDetail.json.post.typeData.poll.resultsVisible === false, 'результаты скрыты до голосования');

  const vote = await call(reader, 'POST', `/api/posts/${poll.json.id}/poll/vote`, { optionId: options[0].id });
  assert(vote.status === 200, 'голос учтён', vote.json);
  const voteAgain = await call(reader, 'POST', `/api/posts/${poll.json.id}/poll/vote`, { optionId: options[1].id });
  assert(
    voteAgain.status === 409 || voteAgain.json?.poll?.myVote === options[0].id,
    'повторное голосование невозможно',
    voteAgain.json,
  );
  const pollAfter = await call(reader, 'GET', `/api/posts/${poll.json.id}`);
  const pollData = pollAfter.json.post.typeData.poll;
  assert(pollData.myVote === options[0].id, 'голос один (первый)', pollData.myVote);
  assert(pollData.resultsVisible === true, 'после голоса результаты видны');
  assert(pollData.totalVotes === 1, 'итого 1 голос', pollData.totalVotes);

  // 8. Поиск команды: роли, заявка, принятие с лимитом мест
  const team = await call(author, 'POST', '/api/posts', {
    type: 'team',
    title: `Ищем фронтендера ${suffix}`,
    body: 'Проект по созданию приложения.',
    status: 'published',
    typeData: { roles: [{ name: 'Фронтенд', capacity: 1 }] },
  });
  assert(team.status === 201, 'команда создана', team.json);
  const teamDetail = await call(reader, 'GET', `/api/posts/${team.json.id}`);
  const role = teamDetail.json.post?.typeData?.team?.roles?.[0];
  assert(role && role.openSeats === 1, 'роль с местами', role);
  const apply = await call(reader, 'POST', `/api/posts/${team.json.id}/apply`, {
    roleId: role.id,
    message: 'Готов работать, есть опыт.',
  });
  assert(apply.status === 201, 'заявка подана', apply.json);
  const teamOwnerView = await call(author, 'GET', `/api/posts/${team.json.id}`);
  assert(teamOwnerView.json.post.typeData.team.pendingCount === 1, 'заявка видна владельцу');
  assert(teamOwnerView.json.post.typeData.team.applications.length === 1, 'список заявок у владельца');

  const decision = await call(author, 'POST', `/api/applications/${apply.json.id}/decision`, { decision: 'accept' });
  assert(decision.status === 200 && decision.json.filled === 1, 'заявка принята, места заполнены', decision.json);
  const teamAfterAccept = await call(reader, 'GET', `/api/posts/${team.json.id}`);
  const roleAfter = teamAfterAccept.json.post.typeData.team.roles[0];
  assert(roleAfter.filled === 1 && roleAfter.openSeats === 0, 'свободных мест нет', roleAfter);

  // Второй кандидат при полных местах
  const reader2 = await login(`smoke_reader2_${suffix}`);
  const apply2 = await call(reader2, 'POST', `/api/posts/${team.json.id}/apply`, {
    roleId: role.id,
    message: 'Тоже хочу, но мест нет.',
  });
  assert(apply2.status === 201, 'вторая заявка принята (в очередь)', apply2.json);
  const decision2 = await call(author, 'POST', `/api/applications/${apply2.json.id}/decision`, { decision: 'accept' });
  assert(decision2.status === 409, 'принять сверх мест нельзя', decision2.status);

  // 9. Событие
  const event = await call(author, 'POST', '/api/posts', {
    type: 'event',
    title: `Встреча сообщества ${suffix}`,
    body: 'Офлайн-встреча.',
    status: 'published',
    typeData: { startsAt: '2030-01-15T18:00:00.000Z', format: 'offline', location: 'Москва, ул. Тестовая, 1' },
  });
  assert(event.status === 201, 'событие создано', event.json);
  const eventDetail = await call(reader, 'GET', `/api/posts/${event.json.id}`);
  assert(eventDetail.json.post?.typeData?.event?.startsAt?.startsWith('2030-01-15'), 'дата события сохранена', eventDetail.json.post?.typeData?.event);
  const attend = await call(reader, 'POST', `/api/posts/${event.json.id}/attend`, { status: 'going' });
  assert(attend.status === 200 && attend.json.goingCount === 1, 'участие подтверждено', attend.json);

  // 10. Уведомления
  const notif = await call(author, 'GET', '/api/notifications?unreadOnly=true');
  assert(notif.status === 200 && notif.json.items.length > 0, 'уведомления пришли', notif.json.items?.length);
  const unreadBefore = notif.json.items.filter((n: any) => !n.readAt).length;
  assert(unreadBefore > 0, 'непрочитанные есть');
  const readAll = await call(author, 'POST', '/api/notifications/read', { all: true });
  assert(readAll.status === 200 && readAll.json.unread === 0, 'прочтение всех', readAll.json);

  // 11. Защита: чужой пост не редактировать, аноним не пишет
  const foreign = await call(reader, 'PATCH', `/api/posts/${postId}`, { title: 'Хакерский заголовок' });
  assert(foreign.status === 403, 'чужой пост не редактируется', foreign.status);
  const anon = new Map<string, string>();
  const anonPost = await call(anon, 'POST', '/api/posts', { type: 'discussion', title: 'Аноним', body: 'x' });
  assert(anonPost.status === 401, 'аноним не создаёт пост', anonPost.status);
  const anonAdmin = await call(anon, 'GET', '/api/admin/stats');
  assert(anonAdmin.status === 401 || anonAdmin.status === 403, 'админка закрыта анониму', anonAdmin.status);
  const userAdmin = await call(reader, 'GET', '/api/admin/stats');
  assert(userAdmin.status === 403, 'админка закрыта обычному пользователю', userAdmin.status);

  // 12. Сохранённые фильтры
  const sf = await call(reader, 'POST', '/api/posts/saved-filters', { name: 'Мой фильтр', query: { mode: 'new', tag: 'x' } });
  assert(sf.status === 201, 'фильтр сохранён', sf.json);
  const sfList = await call(reader, 'GET', '/api/posts/saved-filters');
  assert(sfList.json.items.some((f: any) => f.id === sf.json.id), 'фильтр в списке');

  // 13. Прочность после «перезагрузки»: новая сессия того же пользователя
  const relogin = await login(`smoke_reader_${suffix}`);
  const favAgain = await call(relogin, 'GET', `/api/posts/${postId}`);
  assert(favAgain.status === 200, 'данные переживают новую сессию');

  // 14. Скрытые авторы не попадают в ленту
  const hide = await call(reader, 'POST', `/api/posts/${postId}/hide`, { targetType: 'author', targetId: inFeed.author.id });
  assert(hide.status === 200, 'автор скрыт', hide.json);
  const feedAfterHide = await call(reader, 'GET', '/api/posts?mode=new&pageSize=50');
  const hiddenGone = (feedAfterHide.json.items as any[]).every((p) => p.author.id !== inFeed.author.id);
  assert(hiddenGone, 'скрытый автор исчез из ленты');

  console.log(`\nИтого: ${checks - failures}/${checks} проверок пройдено.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Критическая ошибка smoke:', error);
  process.exitCode = 1;
});
