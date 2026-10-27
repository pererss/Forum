// Настройки платформы (JSONB-ключ): единое хранилище правил XP, порогов уровней и пр.

import { one, rows } from '../db/sql';
import type { Queryable } from '../db/sql';

type CacheEntry = { value: unknown; at: number };

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

export async function getSetting<T>(key: string, fallback: T, db?: Queryable): Promise<T> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value as T;

  const row = await one<{ value: unknown }>('SELECT value FROM platform_settings WHERE key = $1', [key], db);
  const value = row ? (row.value as T) : fallback;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting(
  key: string,
  value: unknown,
  description: string,
  adminId: string | null,
  db?: Queryable,
): Promise<void> {
  await one(
    `INSERT INTO platform_settings (key, value, description, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           description = EXCLUDED.description,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
    [key, JSON.stringify(value), description, adminId],
    db,
  );
  cache.delete(key);
}

export async function listSettings(db?: Queryable): Promise<
  { key: string; value: unknown; description: string; updatedAt: string }[]
> {
  const list = await rows<{ key: string; value: unknown; description: string; updated_at: Date }>(
    'SELECT key, value, description, updated_at FROM platform_settings ORDER BY key',
    [],
    db,
  );
  return list.map((row) => ({
    key: row.key,
    value: row.value,
    description: row.description,
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

export function invalidateSettingsCache(): void {
  cache.clear();
}

// ————— Значения по умолчанию (записываются скриптом seed) —————

export type XpRules = Record<string, number>;

export const DEFAULT_XP_RULES: XpRules = {
  post_published: 10,
  article_published: 20,
  comment: 3,
  comment_received_reaction: 5,
  answer_accepted: 25,
  poll_created: 5,
  event_created: 8,
  checklist_completed: 6,
  profile_setup: 5,
  achievement: 15,
};

export const SETTINGS_KEYS = {
  xpRules: 'xp_rules',
  levelThresholds: 'level_thresholds',
  feedPageSize: 'feed_page_size',
  siteTitle: 'site_title',
  registrationOpen: 'registration_open',
} as const;

/** Пороги уровней: уровень n доступен с накопленным опытом xp. */
export function defaultLevelThresholds(): { level: number; xp: number }[] {
  const list: { level: number; xp: number }[] = [];
  for (let level = 1; level <= 30; level += 1) {
    list.push({ level, xp: level === 1 ? 0 : Math.round(120 * Math.pow(level - 1, 1.75)) });
  }
  return list;
}
