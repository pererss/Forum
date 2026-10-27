// Опыт, уровни и достижения.
// Ключевые гарантии: опыт начисляется один раз на событие (уникальный ключ progress_events),
// уровни вычисляются из порогов в настройках платформы, клиент не может менять эти данные.

import type { Queryable } from '../db/sql';
import { one, rows } from '../db/sql';
import { newId } from '../lib/ids';
import {
  DEFAULT_XP_RULES,
  SETTINGS_KEYS,
  defaultLevelThresholds,
  getSetting,
  type XpRules,
} from './platform-settings';
import type { AchievementDto, LevelProgress } from '../../shared/types';

export type LevelThreshold = { level: number; xp: number };

export async function getLevelThresholds(db?: Queryable): Promise<LevelThreshold[]> {
  const stored = await getSetting<LevelThreshold[] | null>(SETTINGS_KEYS.levelThresholds, null, db);
  if (
    Array.isArray(stored) &&
    stored.length > 0 &&
    stored.every((item) => typeof item?.level === 'number' && typeof item?.xp === 'number')
  ) {
    return [...stored].sort((a, b) => a.xp - b.xp);
  }
  return defaultLevelThresholds();
}

export async function getXpRules(db?: Queryable): Promise<XpRules> {
  const stored = await getSetting<Partial<XpRules> | null>(SETTINGS_KEYS.xpRules, null, db);
  if (stored && typeof stored === 'object') {
    const merged: XpRules = { ...DEFAULT_XP_RULES };
    for (const [key, value] of Object.entries(stored)) {
      if (typeof value === 'number' && Number.isFinite(value)) merged[key] = Math.round(value);
    }
    return merged;
  }
  return { ...DEFAULT_XP_RULES };
}

export function computeLevelProgress(xp: number, thresholds: LevelThreshold[]): LevelProgress {
  const sorted = [...thresholds].sort((a, b) => a.xp - b.xp);
  if (sorted.length === 0) {
    return { level: 1, xp, xpIntoLevel: xp, xpForNext: 100, percent: Math.min(100, xp) };
  }

  let level = sorted[0]!.level;
  let baseXp = sorted[0]!.xp;
  let nextXp: number | null = null;

  for (const threshold of sorted) {
    if (xp >= threshold.xp) {
      level = threshold.level;
      baseXp = threshold.xp;
    } else {
      nextXp = threshold.xp;
      break;
    }
  }

  if (nextXp === null) {
    return { level, xp, xpIntoLevel: 0, xpForNext: 0, percent: 100 };
  }
  const span = Math.max(1, nextXp - baseXp);
  const into = Math.max(0, xp - baseXp);
  return {
    level,
    xp,
    xpIntoLevel: into,
    xpForNext: span,
    percent: Math.max(0, Math.min(100, Math.round((into / span) * 100))),
  };
}

export async function getLevelProgress(xp: number, db?: Queryable): Promise<LevelProgress> {
  return computeLevelProgress(xp, await getLevelThresholds(db));
}

export type AwardParams = {
  userId: string;
  kind: string;
  xp: number;
  rep?: number;
  reason: string;
  sourceType?: string;
  sourceId?: string;
  actorId?: string | null;
};

/**
 * Начисляет опыт/репутацию ровно один раз на комбинацию (user, kind, source).
 * Возвращает true, если начисление произошло (первый раз).
 */
export async function awardXp(db: Queryable, params: AwardParams): Promise<boolean> {
  const {
    userId,
    kind,
    xp,
    rep = 0,
    reason,
    sourceType = '',
    sourceId = '',
    actorId = null,
  } = params;

  const inserted = await one<{ id: string }>(
    `INSERT INTO progress_events (id, user_id, kind, xp_delta, rep_delta, reason, source_type, source_id, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, kind, source_type, source_id) DO NOTHING
     RETURNING id`,
    [newId(), userId, kind, Math.round(xp), Math.round(rep), reason, sourceType, sourceId, actorId],
    db,
  );
  if (!inserted) return false;

  if (xp !== 0 || rep !== 0) {
    const updated = await one<{ xp: number; level: number }>(
      `UPDATE users SET xp = GREATEST(0, xp + $2), reputation = reputation + $3, updated_at = now()
       WHERE id = $1 RETURNING xp, level`,
      [userId, Math.round(xp), Math.round(rep)],
      db,
    );
    if (updated) {
      const progress = computeLevelProgress(updated.xp, await getLevelThresholds(db));
      if (progress.level !== updated.level) {
        await one('UPDATE users SET level = $2, updated_at = now() WHERE id = $1', [userId, progress.level], db);
      }
    }
  }
  return true;
}

export async function listAchievements(db?: Queryable): Promise<AchievementDto[]> {
  const list = await rows<{
    id: string;
    slug: string;
    name: string;
    description: string;
    icon: string;
    color: string;
  }>(
    `SELECT id, slug, name, description, icon, color FROM achievements
     WHERE is_active = true ORDER BY sort_order, name`,
    [],
    db,
  );
  return list.map((row) => ({ ...row }));
}

export async function achievementsForUser(
  userId: string,
  db?: Queryable,
): Promise<(AchievementDto & { awardedAt: string })[]> {
  const list = await rows<{
    id: string;
    slug: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    awarded_at: Date;
  }>(
    `SELECT a.id, a.slug, a.name, a.description, a.icon, a.color, ua.awarded_at
     FROM user_achievements ua
     JOIN achievements a ON a.id = ua.achievement_id
     WHERE ua.user_id = $1
     ORDER BY ua.awarded_at DESC`,
    [userId],
    db,
  );
  return list.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    awardedAt: new Date(row.awarded_at).toISOString(),
  }));
}

/** Выдаёт достижение (идемпотентно). Возвращает true, если выдано впервые. */
export async function awardAchievement(
  db: Queryable,
  userId: string,
  achievement: { id: string; slug: string; name: string },
): Promise<boolean> {
  const inserted = await one<{ achievement_id: string }>(
    `INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2)
     ON CONFLICT (user_id, achievement_id) DO NOTHING
     RETURNING achievement_id`,
    [userId, achievement.id],
    db,
  );
  if (!inserted) return false;

  const rules = await getXpRules(db);
  await awardXp(db, {
    userId,
    kind: 'achievement',
    xp: rules.achievement ?? 15,
    reason: `Достижение «${achievement.name}»`,
    sourceType: 'achievement',
    sourceId: achievement.id,
  });
  return true;
}
