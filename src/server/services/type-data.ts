// Данные конкретных типов публикаций: запись при создании/редактировании
// и чтение для детальной страницы. Валидация — через typeDataSchemaFor.

import type { Queryable } from '../db/sql';
import { one, rows } from '../db/sql';
import { badRequest, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { typeDataSchemaFor } from '../../shared/schemas';
import type {
  ChecklistDto,
  EventDto,
  GoalDto,
  PollDto,
  PostTypeData,
  ProjectDto,
  SessionUser,
  TeamDto,
  VacancyDto,
} from '../../shared/types';
import type { PostType } from '../../shared/post-types';

export async function persistTypeData(
  postId: string,
  type: PostType,
  data: unknown,
  db: Queryable,
): Promise<void> {
  const schema = typeDataSchemaFor(type);
  if (!schema) return; // у типа нет структурированных полей
  const parsed = schema.parse(data);

  switch (type) {
    case 'poll': {
      const input = parsed as {
        options: string[];
        closesAt?: string;
        showResultsAfterVote: boolean;
      };
      const existing = await one<{ post_id: string }>(
        'SELECT post_id FROM polls WHERE post_id = $1',
        [postId],
        db,
      );
      if (existing) throw badRequest('Опрос уже настроен — голосование нельзя менять после создания.');

      const pollId = postId; // PK опроса — post_id; варианты ссылаются на него
      await db.query(
        `INSERT INTO polls (post_id, closes_at, show_results_after_vote, status)
         VALUES ($1, $2, $3, 'open')`,
        [postId, input.closesAt ?? null, input.showResultsAfterVote],
      );
      for (let i = 0; i < input.options.length; i += 1) {
        await db.query(
          'INSERT INTO poll_options (id, poll_id, text, position) VALUES ($1, $2, $3, $4)',
          [newId(), pollId, input.options[i]!, i],
        );
      }
      return;
    }
    case 'team': {
      const input = parsed as {
        roles: { name: string; description?: string; capacity: number }[];
        expiresAt?: string;
      };
      const existing = await one<{ post_id: string }>(
        'SELECT post_id FROM project_roles WHERE post_id = $1 LIMIT 1',
        [postId],
        db,
      );
      if (existing) throw badRequest('Роли команды уже заданы.');
      for (let i = 0; i < input.roles.length; i += 1) {
        const role = input.roles[i]!;
        await db.query(
          `INSERT INTO project_roles (id, post_id, name, description, capacity, position)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [newId(), postId, role.name, role.description ?? null, role.capacity, i],
        );
      }
      // Срок актуальности хранится в posts.expires_at.
      if (input.expiresAt) {
        await db.query('UPDATE posts SET expires_at = $2 WHERE id = $1', [
          postId,
          new Date(input.expiresAt).toISOString(),
        ]);
      }
      return;
    }
    case 'event': {
      const input = parsed as {
        startsAt: string;
        endsAt?: string;
        format: 'offline' | 'online';
        location?: string;
        onlineUrl?: string;
        capacity?: number;
      };
      await db.query(
        `INSERT INTO events (post_id, starts_at, ends_at, format, location, online_url, capacity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          postId,
          new Date(input.startsAt).toISOString(),
          input.endsAt ? new Date(input.endsAt).toISOString() : null,
          input.format,
          input.location ?? null,
          input.onlineUrl ?? null,
          input.capacity ?? null,
        ],
      );
      return;
    }
    case 'vacancy': {
      const input = parsed as {
        company?: string;
        employment?: string;
        compensation?: string;
        contactMethod: 'comments' | 'profile' | 'external';
        externalUrl?: string;
        expiresAt?: string;
      };
      await db.query(
        `INSERT INTO vacancies (post_id, company, employment, compensation, contact_method, external_url, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          postId,
          input.company ?? null,
          input.employment ?? null,
          input.compensation ?? null,
          input.contactMethod,
          input.externalUrl ?? null,
          input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
        ],
      );
      return;
    }
    case 'project': {
      const input = parsed as {
        projectStatus: ProjectDto['projectStatus'];
        externalUrl?: string;
        tech: string[];
      };
      await db.query(
        `INSERT INTO portfolio_projects (post_id, project_status, external_url, tech)
         VALUES ($1, $2, $3, $4)`,
        [postId, input.projectStatus, input.externalUrl ?? null, JSON.stringify(input.tech)],
      );
      return;
    }
    case 'goal': {
      const input = parsed as {
        targetValue: number;
        unit: string;
        deadline?: string;
        milestones: { title: string; isDone: boolean }[];
      };
      await db.query(
        `INSERT INTO goals (post_id, target_value, current_value, unit, deadline)
         VALUES ($1, $2, 0, $3, $4)`,
        [
          postId,
          input.targetValue,
          input.unit,
          input.deadline ? new Date(input.deadline).toISOString() : null,
        ],
      );
      for (let i = 0; i < input.milestones.length; i += 1) {
        const milestone = input.milestones[i]!;
        await db.query(
          'INSERT INTO goal_milestones (id, goal_id, title, is_done, position) VALUES ($1, $2, $3, $4, $5)',
          [newId(), postId, milestone.title, milestone.isDone, i],
        );
      }
      return;
    }
    case 'checklist': {
      const input = parsed as { items: { text: string; isDone: boolean }[] };
      for (let i = 0; i < input.items.length; i += 1) {
        const item = input.items[i]!;
        await db.query(
          `INSERT INTO checklist_items (id, post_id, text, is_done, position, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [newId(), postId, item.text, item.isDone, i, null],
        );
      }
      return;
    }
    default:
      return;
  }
}

// ————— Чтение —————

export async function loadTypeData(
  postId: string,
  type: PostType,
  viewer: SessionUser | null,
  db: Queryable,
): Promise<PostTypeData> {
  switch (type) {
    case 'poll':
      return { poll: await loadPoll(postId, viewer, db) };
    case 'team':
      return { team: await loadTeam(postId, viewer, db) };
    case 'event':
      return { event: await loadEvent(postId, viewer, db) };
    case 'vacancy':
      return { vacancy: await loadVacancy(postId, db) };
    case 'project':
      return { project: await loadProject(postId, db) };
    case 'goal':
      return { goal: await loadGoal(postId, db) };
    case 'checklist':
      return { checklist: await loadChecklist(postId, viewer, db) };
    default:
      return {};
  }
}

async function loadPoll(
  postId: string,
  viewer: SessionUser | null,
  db: Queryable,
): Promise<PollDto> {
  const poll = await one<{
    closes_at: Date | string | null;
    status: 'open' | 'closed';
    show_results_after_vote: boolean;
    total_votes: number;
  }>(
    'SELECT closes_at, status, show_results_after_vote, total_votes FROM polls WHERE post_id = $1',
    [postId],
    db,
  );
  if (!poll) throw notFound('Опрос не найден.');

  const options = await rows<{ id: string; text: string; votes_count: number }>(
    'SELECT id, text, votes_count FROM poll_options WHERE poll_id = $1 ORDER BY position',
    [postId],
    db,
  );

  const closed =
    poll.status === 'closed' || (poll.closes_at !== null && new Date(poll.closes_at).getTime() <= Date.now());

  const myVote = viewer
    ? await one<{ option_id: string }>(
        'SELECT option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
        [postId, viewer.id],
        db,
      )
    : null;

  const showResults =
    !poll.show_results_after_vote ||
    Boolean(myVote) ||
    closed ||
    viewer?.role === 'admin' ||
    viewer?.role === 'moderator';

  const total = poll.total_votes;
  const result: PollDto = {
    closesAt: poll.closes_at ? new Date(poll.closes_at).toISOString() : null,
    status: closed ? 'closed' : 'open',
    showResultsAfterVote: poll.show_results_after_vote,
    totalVotes: total,
    resultsVisible: showResults,
    myVote: myVote?.option_id ?? null,
    options: options.map((option) => ({
      id: option.id,
      text: option.text,
      votesCount: showResults ? option.votes_count : 0,
      percent:
        showResults && total > 0 ? Math.round((option.votes_count / total) * 1000) / 10 : 0,
    })),
  };
  return result;
}

async function loadTeam(
  postId: string,
  viewer: SessionUser | null,
  db: Queryable,
): Promise<TeamDto> {
  const roles = await rows<{
    id: string;
    name: string;
    description: string | null;
    capacity: number;
    filled: number;
  }>(
    'SELECT id, name, description, capacity, filled FROM project_roles WHERE post_id = $1 ORDER BY position',
    [postId],
    db,
  );

  const isOwner = await one<{ author_id: string }>(
    'SELECT author_id FROM posts WHERE id = $1',
    [postId],
    db,
  );
  const canSeeApplications =
    Boolean(viewer) &&
    (viewer!.role === 'admin' || viewer!.role === 'moderator' || isOwner?.author_id === viewer!.id);

  const pendingCountRow = await one<{ count: string }>(
    "SELECT count(*) AS count FROM applications WHERE post_id = $1 AND status = 'pending'",
    [postId],
    db,
  );

  const applications = canSeeApplications
    ? await rows<{
        id: string;
        post_id: string;
        role_id: string;
        user_id: string;
        message: string;
        status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
        created_at: Date;
        decided_at: Date | null;
        username: string | null;
        display_name: string;
        role: 'user' | 'moderator' | 'admin';
        level: number;
        reputation: number;
      }>(
        `SELECT a.id, a.post_id, a.role_id, a.user_id, a.message, a.status, a.created_at, a.decided_at,
                u.username, u.display_name, u.role, u.level, u.reputation
         FROM applications a JOIN users u ON u.id = a.user_id
         WHERE a.post_id = $1
         ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a.created_at DESC`,
        [postId],
        db,
      )
    : [];

  const viewerApplication = viewer
    ? await rows<{
        id: string;
        post_id: string;
        role_id: string;
        user_id: string;
        message: string;
        status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
        created_at: Date;
        decided_at: Date | null;
        username: string | null;
        display_name: string;
        role: 'user' | 'moderator' | 'admin';
        level: number;
        reputation: number;
      }>(
        `SELECT a.id, a.post_id, a.role_id, a.user_id, a.message, a.status, a.created_at, a.decided_at,
                u.username, u.display_name, u.role, u.level, u.reputation
         FROM applications a JOIN users u ON u.id = a.user_id
         WHERE a.post_id = $1 AND a.user_id = $2`,
        [postId, viewer.id],
        db,
      )
    : [];

  const toItem = (row: (typeof applications)[number]) => ({
    id: row.id,
    postId: row.post_id,
    roleId: row.role_id,
    roleName: roles.find((role) => role.id === row.role_id)?.name,
    user: {
      id: row.user_id,
      username: row.username ?? 'user',
      displayName: row.display_name,
      role: row.role,
      level: row.level,
      reputation: row.reputation,
    },
    message: row.message,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
  });

  // Срок актуальности команды — posts.expires_at.
  const expiresRow = await one<{ expires_at: Date | string | null }>(
    'SELECT expires_at FROM posts WHERE id = $1',
    [postId],
    db,
  );

  return {
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      capacity: role.capacity,
      filled: role.filled,
      openSeats: Math.max(0, role.capacity - role.filled),
    })),
    expiresAt: expiresRow?.expires_at ? new Date(expiresRow.expires_at).toISOString() : null,
    applications: applications.map(toItem),
    pendingCount: Number(pendingCountRow?.count ?? 0),
    viewerApplication: viewerApplication[0] ? toItem(viewerApplication[0]) : null,
  };
}

async function loadEvent(postId: string, viewer: SessionUser | null, db: Queryable): Promise<EventDto> {
  const event = await one<{
    starts_at: Date;
    ends_at: Date | null;
    format: 'offline' | 'online';
    location: string | null;
    online_url: string | null;
    capacity: number | null;
    going_count: number;
    status: 'scheduled' | 'completed' | 'cancelled';
  }>(
    `SELECT starts_at, ends_at, format, location, online_url, capacity, going_count, status
     FROM events WHERE post_id = $1`,
    [postId],
    db,
  );
  if (!event) throw notFound('Событие не найдено.');

  const viewerRow = viewer
    ? await one<{ status: 'going' | 'maybe' }>(
        'SELECT status FROM event_attendees WHERE event_id = $1 AND user_id = $2',
        [postId, viewer.id],
        db,
      )
    : null;

  return {
    startsAt: new Date(event.starts_at).toISOString(),
    endsAt: event.ends_at ? new Date(event.ends_at).toISOString() : null,
    format: event.format,
    // Ссылка на онлайн-встречу видна только тем, кто идёт/интересуется.
    location: event.location,
    onlineUrl:
      event.online_url && (!event.online_url.startsWith('http') || viewerRow ? event.online_url : null),
    capacity: event.capacity,
    goingCount: event.going_count,
    status: event.status,
    viewerStatus: viewerRow?.status ?? null,
  };
}

async function loadVacancy(postId: string, db: Queryable): Promise<VacancyDto | undefined> {
  const row = await one<{
    company: string | null;
    employment: string | null;
    compensation: string | null;
    contact_method: 'comments' | 'profile' | 'external';
    external_url: string | null;
    expires_at: Date | null;
  }>(
    'SELECT company, employment, compensation, contact_method, external_url, expires_at FROM vacancies WHERE post_id = $1',
    [postId],
    db,
  );
  if (!row) return undefined;
  return {
    company: row.company,
    employment: row.employment,
    compensation: row.compensation,
    contactMethod: row.contact_method,
    externalUrl: row.external_url,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
  };
}

async function loadProject(postId: string, db: Queryable): Promise<ProjectDto | undefined> {
  const row = await one<{
    project_status: ProjectDto['projectStatus'];
    external_url: string | null;
    tech: unknown;
  }>('SELECT project_status, external_url, tech FROM portfolio_projects WHERE post_id = $1', [postId], db);
  if (!row) return undefined;
  const tech = Array.isArray(row.tech) ? (row.tech as unknown[]).filter((t): t is string => typeof t === 'string') : [];
  return { projectStatus: row.project_status, externalUrl: row.external_url, tech };
}

async function loadGoal(postId: string, db: Queryable): Promise<GoalDto | undefined> {
  const row = await one<{
    target_value: string | number;
    current_value: string | number;
    unit: string;
    deadline: Date | null;
  }>('SELECT target_value, current_value, unit, deadline FROM goals WHERE post_id = $1', [postId], db);
  if (!row) return undefined;
  const target = Number(row.target_value);
  const current = Number(row.current_value);
  const milestones = await rows<{ id: string; title: string; is_done: boolean; position: number }>(
    'SELECT id, title, is_done, position FROM goal_milestones WHERE goal_id = $1 ORDER BY position',
    [postId],
    db,
  );
  return {
    targetValue: target,
    currentValue: current,
    unit: row.unit,
    deadline: row.deadline ? new Date(row.deadline).toISOString() : null,
    percent: target > 0 ? Math.max(0, Math.min(100, Math.round((current / target) * 100))) : 0,
    milestones: milestones.map((item) => ({
      id: item.id,
      title: item.title,
      isDone: item.is_done,
      position: item.position,
    })),
  };
}

async function loadChecklist(
  postId: string,
  viewer: SessionUser | null,
  db: Queryable,
): Promise<ChecklistDto> {
  const items = await rows<{
    id: string;
    text: string;
    is_done: boolean;
    position: number;
    updated_by: string | null;
    updated_at: Date;
  }>(
    `SELECT id, text, is_done, position, updated_by, updated_at
     FROM checklist_items
     WHERE post_id = $1
     ORDER BY position, created_at`,
    [postId],
    db,
  );
  const collaborators = await rows<{
    user_id: string;
    username: string | null;
    display_name: string;
    role: 'user' | 'moderator' | 'admin';
    level: number;
    reputation: number;
  }>(
    `SELECT pc.user_id, u.username, u.display_name, u.role, u.level, u.reputation
     FROM post_collaborators pc JOIN users u ON u.id = pc.user_id
     WHERE pc.post_id = $1`,
    [postId],
    db,
  );
  const post = await one<{ author_id: string }>('SELECT author_id FROM posts WHERE id = $1', [postId], db);
  const isCollaborator = collaborators.some((item) => item.user_id === viewer?.id);
  const isOwner = post?.author_id === viewer?.id;
  const isMod = viewer?.role === 'admin' || viewer?.role === 'moderator';

  const done = items.filter((item) => item.is_done).length;
  return {
    items: items.map((item) => ({
      id: item.id,
      text: item.text,
      isDone: item.is_done,
      position: item.position,
      updatedBy: item.updated_by,
      updatedAt: new Date(item.updated_at).toISOString(),
    })),
    done,
    total: items.length,
    collaborators: collaborators.map((row) => ({
      id: row.user_id,
      username: row.username ?? 'user',
      displayName: row.display_name,
      role: row.role,
      level: row.level,
      reputation: row.reputation,
    })),
    canEditItems: Boolean(isOwner || isCollaborator || isMod),
  };
}
