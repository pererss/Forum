// Теги: нормализация, создание по требованию, актуальный счётчик использования.

import type { Queryable } from '../db/sql';
import { one, rows } from '../db/sql';
import { newId } from '../lib/ids';
import { normalizeTagName, normalizeTagSlug } from '../../shared/slug';
import type { TagDto } from '../../shared/types';

export type TagInput = { slug: string; name: string };

/** Превращает пользовательский ввод (одиночный тег или строку через запятую) в список. */
export function parseTagInputs(inputs: string[]): TagInput[] {
  const seen = new Set<string>();
  const result: TagInput[] = [];
  for (const raw of inputs) {
    for (const piece of raw.split(',')) {
      const name = normalizeTagName(piece);
      if (!name) continue;
      const slug = normalizeTagSlug(name);
      if (slug.length < 2 || seen.has(slug)) continue;
      seen.add(slug);
      result.push({ slug, name });
      if (result.length >= 8) return result;
    }
  }
  return result;
}

/** Создаёт отсутствующие теги и возвращает их канонические записи. */
export async function ensureTags(db: Queryable, tags: TagInput[]): Promise<TagDto[]> {
  const result: TagDto[] = [];
  for (const tag of tags) {
    const existing = await one<{ id: string; slug: string; name: string }>(
      'SELECT id, slug, name FROM tags WHERE slug = $1',
      [tag.slug],
      db,
    );
    if (existing) {
      result.push(existing);
      continue;
    }
    const created = await one<{ id: string; slug: string; name: string }>(
      `INSERT INTO tags (id, slug, name) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET slug = tags.slug
       RETURNING id, slug, name`,
      [newId(), tag.slug, tag.name],
      db,
    );
    result.push(created!);
  }
  return result;
}

/** Пересчитывает usage_count по post_tags — точнее, чем инкременты (нет расхождений). */
export async function recalcTagUsage(db: Queryable, tagIds: string[]): Promise<void> {
  if (tagIds.length === 0) return;
  const placeholders = tagIds.map((_, index) => `$${index + 1}`).join(', ');
  await db.query(
    `UPDATE tags SET usage_count = (
       SELECT count(*) FROM post_tags WHERE post_tags.tag_id = tags.id
     )
     WHERE id IN (${placeholders})`,
    tagIds,
  );
}

export async function tagsForPosts(
  postIds: string[],
  db?: Queryable,
): Promise<Map<string, TagDto[]>> {
  const map = new Map<string, TagDto[]>();
  if (postIds.length === 0) return map;
  const placeholders = postIds.map((_, index) => `$${index + 1}`).join(', ');
  const list = await rows<{ post_id: string; id: string; slug: string; name: string }>(
    `SELECT pt.post_id, t.id, t.slug, t.name
     FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
     WHERE pt.post_id IN (${placeholders})
     ORDER BY t.name`,
    postIds,
    db,
  );
  for (const row of list) {
    const current = map.get(row.post_id) ?? [];
    current.push({ id: row.id, slug: row.slug, name: row.name });
    map.set(row.post_id, current);
  }
  return map;
}

export async function popularTags(limit = 20): Promise<(TagDto & { usageCount: number })[]> {
  return rows<TagDto & { usage_count: number }>(
    `SELECT id, slug, name, usage_count FROM tags
     WHERE is_active = true
     ORDER BY usage_count DESC, name ASC
     LIMIT $1`,
    [limit],
  ).then((list) =>
    list.map((tag) => ({
      id: tag.id,
      slug: tag.slug,
      name: tag.name,
      usageCount: tag.usage_count,
    })),
  );
}

export async function searchTags(query: string, limit = 20): Promise<TagDto[]> {
  const q = `%${query.trim()}%`;
  const list = await rows<{ id: string; slug: string; name: string; usage_count: number }>(
    `SELECT id, slug, name, usage_count FROM tags
     WHERE is_active = true AND (slug ILIKE $1 OR name ILIKE $1)
     ORDER BY usage_count DESC, name ASC
     LIMIT $2`,
    [q, limit],
  );
  return list.map((tag) => ({ id: tag.id, slug: tag.slug, name: tag.name, usageCount: tag.usage_count }));
}
