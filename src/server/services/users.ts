// Пользователи: профили, настройки, интересы, подписки, поиск авторов.

import type { Queryable } from '../db/sql';
import { one, rows } from '../db/sql';
import { badRequest, conflict, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { normalizeSettings, patchSettings } from '../../shared/settings';
import type {
  AchievementDto,
  AuthorDto,
  ProfileDto,
  Role,
  SessionUser,
  TagDto,
  UserSettings,
  UserStatus,
} from '../../shared/types';
import { normalizeUsername } from '../../shared/slug';
import { ensureTags, parseTagInputs } from './tags';
import { achievementsForUser, getLevelProgress } from './xp';

export type UserRow = {
  id: string;
  username: string | null;
  username_lower: string | null;
  display_name: string;
  bio: string | null;
  role: Role;
  status: UserStatus;
  xp: number;
  reputation: number;
  level: number;
  settings: unknown;
  onboarded_at: Date | string | null;
  created_at: Date | string;
};

const USER_COLUMNS = `
  id, username, username_lower, display_name, bio, role, status,
  xp, reputation, level, settings, onboarded_at, created_at
`;

export async function findUserById(id: string, db?: Queryable): Promise<UserRow | null> {
  return one<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id], db);
}

export async function findUserByUsername(
  username: string,
  db?: Queryable,
): Promise<UserRow | null> {
  return one<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE username_lower = $1`,
    [normalizeUsername(username)],
    db,
  );
}

export function toAuthorDto(row: {
  id: string;
  username: string | null;
  display_name: string;
  role: Role;
  level: number;
  reputation: number;
}): AuthorDto {
  return {
    id: row.id,
    username: row.username ?? 'user',
    displayName: row.display_name,
    role: row.role,
    level: row.level,
    reputation: row.reputation,
  };
}

/** Пакетное получение авторов для списка сущностей — без N+1 запросов. */
export async function authorsByIds(
  ids: string[],
  db?: Queryable,
): Promise<Map<string, AuthorDto>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const map = new Map<string, AuthorDto>();
  if (unique.length === 0) return map;
  const placeholders = unique.map((_, index) => `$${index + 1}`).join(', ');
  const list = await rows<{
    id: string;
    username: string | null;
    display_name: string;
    role: Role;
    level: number;
    reputation: number;
  }>(
    `SELECT id, username, display_name, role, level, reputation
     FROM users WHERE id IN (${placeholders})`,
    unique,
    db,
  );
  for (const row of list) map.set(row.id, toAuthorDto(row));
  return map;
}

// ————— Интересы —————

export async function interestsForUser(userId: string, db?: Queryable): Promise<TagDto[]> {
  return rows<TagDto>(
    `SELECT t.id, t.slug, t.name
     FROM user_interests ui JOIN tags t ON t.id = ui.tag_id
     WHERE ui.user_id = $1
     ORDER BY t.name`,
    [userId],
    db,
  );
}

async function replaceInterests(userId: string, slugs: string[], db: Queryable): Promise<void> {
  await db.query('DELETE FROM user_interests WHERE user_id = $1', [userId]);
  if (slugs.length === 0) return;
  const tags = await ensureTags(db, parseTagInputs(slugs));
  for (const tag of tags) {
    await db.query(
      `INSERT INTO user_interests (user_id, tag_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, tag.id],
    );
  }
}

// ————— Счётчики профиля —————

async function profileCounts(
  user: UserRow,
  settings: UserSettings,
  isSelf: boolean,
  db: Queryable,
): Promise<ProfileDto['counts']> {
  const [posts, comments, followers, following] = await Promise.all([
    one<{ count: string }>(
      "SELECT count(*) AS count FROM posts WHERE author_id = $1 AND status = 'published'",
      [user.id],
      db,
    ),
    one<{ count: string }>(
      "SELECT count(*) AS count FROM comments WHERE author_id = $1 AND status = 'visible'",
      [user.id],
      db,
    ),
    one<{ count: string }>(
      'SELECT count(*) AS count FROM follows WHERE followee_id = $1',
      [user.id],
      db,
    ),
    one<{ count: string }>(
      'SELECT count(*) AS count FROM follows WHERE follower_id = $1',
      [user.id],
      db,
    ),
  ]);
  // Владелец всегда видит свои числа; остальные — согласно настройкам приватности.
  const showActivity = isSelf || settings.privacy.showActivity;
  const showFollowing = isSelf || settings.privacy.showFollowing;
  return {
    posts: showActivity ? Number(posts?.count ?? 0) : null,
    comments: showActivity ? Number(comments?.count ?? 0) : null,
    followers: showActivity ? Number(followers?.count ?? 0) : null,
    following: showFollowing ? Number(following?.count ?? 0) : null,
  };
}

// ————— Получение профиля —————

export async function getProfile(
  username: string,
  viewer: SessionUser | null,
  db: Queryable,
): Promise<ProfileDto> {
  const user = await findUserByUsername(username, db);
  if (!user || user.status === 'banned') throw notFound('Пользователь не найден.');
  if (!user.username) throw notFound('Пользователь ещё не завершил настройку профиля.');

  const settings = normalizeSettings(user.settings);
  const isSelf = viewer?.id === user.id;
  const isModerator = viewer?.role === 'admin' || viewer?.role === 'moderator';

  const viewerRow =
    viewer && !isSelf
      ? await one<{ follower: boolean; followee: boolean }>(
          `SELECT
             EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2) AS follower,
             EXISTS (SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = $1) AS followee`,
          [viewer.id, user.id],
          db,
        )
      : null;

  const [interests, achievements, progress, counts] = await Promise.all([
    interestsForUser(user.id, db),
    achievementsForUser(user.id, db),
    getLevelProgress(user.xp, db),
    profileCounts(user, settings, Boolean(isSelf), db),
  ]);

  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    bio: user.bio,
    role: user.role,
    level: user.level,
    xp: user.xp,
    reputation: user.reputation,
    createdAt: new Date(user.created_at).toISOString(),
    // Приватные настройки отдаются только владельцу.
    ...(isSelf ? { settings } : {}),
    interests,
    achievements: achievements satisfies AchievementDto[],
    counts,
    progress,
    viewer: {
      isSelf,
      isFollowing: Boolean(viewerRow?.follower),
      isFollowedBy: Boolean(viewerRow?.followee),
      ...(isSelf || isModerator ? { status: user.status } : {}),
    },
  };
}

// ————— Первоначальная настройка профиля —————

export async function setupProfile(
  userId: string,
  input: { username: string; displayName?: string; interests: string[] },
  db: Queryable,
): Promise<{ username: string }> {
  const lower = normalizeUsername(input.username);

  const existing = await one<{ id: string }>(
    'SELECT id FROM users WHERE username_lower = $1 AND id <> $2',
    [lower, userId],
    db,
  );
  if (existing) throw conflict('Это имя пользователя уже занято.');

  const updated = await one<{ username: string | null; onboarded_at: Date | string | null }>(
    `UPDATE users
     SET username = $2, username_lower = $3,
         display_name = COALESCE(NULLIF($4, ''), display_name),
         onboarded_at = COALESCE(onboarded_at, now()),
         updated_at = now()
     WHERE id = $1
     RETURNING username, onboarded_at`,
    [userId, lower, lower, input.displayName?.trim() ?? ''],
    db,
  );
  if (!updated?.username) throw badRequest('Не удалось сохранить профиль.');

  await replaceInterests(userId, input.interests, db);
  return { username: updated.username };
}

// ————— Обновление профиля —————

export async function updateProfile(
  userId: string,
  input: {
    displayName?: string;
    bio?: string | null;
    interests?: string[];
    settings?: unknown;
  },
  db: Queryable,
): Promise<void> {
  const user = await findUserById(userId, db);
  if (!user) throw notFound('Пользователь не найден.');

  const displayName = input.displayName?.trim();
  const bio = input.bio === undefined ? undefined : input.bio?.trim() || null;

  if (displayName !== undefined || bio !== undefined) {
    await db.query(
      `UPDATE users
       SET display_name = COALESCE($2, display_name),
           bio = CASE WHEN $3::boolean THEN $4 ELSE bio END,
           updated_at = now()
       WHERE id = $1`,
      [userId, displayName ?? null, bio !== undefined, bio ?? null],
    );
  }

  if (input.settings !== undefined) {
    const merged = patchSettings(normalizeSettings(user.settings), input.settings);
    await db.query('UPDATE users SET settings = $2, updated_at = now() WHERE id = $1', [
      userId,
      JSON.stringify(merged),
    ]);
  }

  if (input.interests !== undefined) {
    await replaceInterests(userId, input.interests, db);
  }
}

// ————— Подписки —————

export async function setFollowing(
  followerId: string,
  username: string,
  follow: boolean,
  db: Queryable,
): Promise<{ following: boolean; followers: number }> {
  const target = await findUserByUsername(username, db);
  if (!target || !target.username) throw notFound('Пользователь не найден.');
  if (target.id === followerId) throw badRequest('Нельзя подписаться на самого себя.');

  if (follow) {
    await db.query(
      `INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [followerId, target.id],
    );
  } else {
    await db.query('DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2', [
      followerId,
      target.id,
    ]);
  }

  const count = await one<{ count: string }>(
    'SELECT count(*) AS count FROM follows WHERE followee_id = $1',
    [target.id],
    db,
  );
  return { following: follow, followers: Number(count?.count ?? 0) };
}

export async function listFollowing(
  userId: string,
  page: number,
  pageSize: number,
  db: Queryable,
): Promise<{ items: AuthorDto[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [items, totalRow] = await Promise.all([
    rows<{
      id: string;
      username: string | null;
      display_name: string;
      role: Role;
      level: number;
      reputation: number;
    }>(
      `SELECT u.id, u.username, u.display_name, u.role, u.level, u.reputation
       FROM follows f JOIN users u ON u.id = f.followee_id
       WHERE f.follower_id = $1 AND u.username IS NOT NULL AND u.status <> 'banned'
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset],
      db,
    ),
    one<{ count: string }>(
      `SELECT count(*) AS count FROM follows f JOIN users u ON u.id = f.followee_id
       WHERE f.follower_id = $1 AND u.username IS NOT NULL AND u.status <> 'banned'`,
      [userId],
      db,
    ),
  ]);
  return { items: items.map(toAuthorDto), total: Number(totalRow?.count ?? 0) };
}

// ————— Поиск —————

export async function searchUsers(query: string, limit: number, db?: Queryable): Promise<AuthorDto[]> {
  const q = `%${query.trim()}%`;
  const list = await rows<{
    id: string;
    username: string | null;
    display_name: string;
    role: Role;
    level: number;
    reputation: number;
  }>(
    `SELECT id, username, display_name, role, level, reputation
     FROM users
     WHERE username IS NOT NULL AND status = 'active'
       AND (username_lower LIKE $1 OR display_name ILIKE $1)
     ORDER BY reputation DESC, display_name ASC
     LIMIT $2`,
    [q.toLowerCase().startsWith('%') ? q : `%${q}%`, limit],
    db,
  );
  return list.map(toAuthorDto);
}

// ————— Черновики —————

export async function countDrafts(userId: string, db?: Queryable): Promise<number> {
  const row = await one<{ count: string }>(
    "SELECT count(*) AS count FROM posts WHERE author_id = $1 AND status = 'draft'",
    [userId],
    db,
  );
  return Number(row?.count ?? 0);
}

/** Новый id для служебных записей (уведомления и т.п.). */
export { newId };
