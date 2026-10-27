// Публичные справочники: категории, популярные теги, типы публикаций.

import { Router } from 'express';
import { getPool } from '../db/pool';
import { rows } from '../db/sql';
import { attachSession } from '../middleware/auth';
import { popularTags, searchTags } from '../services/tags';
import { z } from 'zod';

export const catalogRouter: Router = Router();

catalogRouter.get('/categories', attachSession, async (_req, res) => {
  const items = await rows<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    color: string;
  }>(
    `SELECT id, slug, name, description, color
     FROM categories WHERE is_active = true
     ORDER BY sort_order, name`,
    [],
    getPool(),
  );
  res.json({ items });
});

catalogRouter.get('/tags', attachSession, async (req, res) => {
  const q = z.string().trim().max(60).parse(req.query.q ?? '');
  if (q.length >= 2) {
    res.json({ items: await searchTags(q, 12) });
    return;
  }
  res.json({ items: await popularTags(30) });
});

catalogRouter.get('/post-types', attachSession, async (_req, res) => {
  const items = await rows<{
    type: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    is_enabled: boolean;
    sort_order: number;
  }>(
    `SELECT type, name, description, icon, color, is_enabled, sort_order
     FROM post_type_settings
     WHERE is_enabled = true
     ORDER BY sort_order, name`,
    [],
    getPool(),
  );
  res.json({ items });
});
