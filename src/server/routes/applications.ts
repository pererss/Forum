// Заявки на участие: решение автора карточки, отзыв своей заявки.

import { Router } from 'express';
import { getPool } from '../db/pool';
import { withTransaction } from '../db/sql';
import { attachSession, requireActiveUser } from '../middleware/auth';
import { applicationDecisionSchema } from '../../shared/schemas';
import { decideApplication, withdrawApplication } from '../services/type-actions';

export const applicationsRouter: Router = Router();

const idParam = (req: { params: Record<string, unknown> }, name: string): string => {
  const value = req.params[name];
  return typeof value === 'string' ? value : String(value ?? '');
};

applicationsRouter.post('/:id/decision', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam(req, 'id');
  const input = applicationDecisionSchema.parse(req.body);
  const result = await withTransaction((db) =>
    decideApplication(id, viewer.id, viewer.role, input.decision, db),
  );
  res.json(result);
});

applicationsRouter.post('/:id/withdraw', attachSession, async (req, res) => {
  const viewer = requireActiveUser(req);
  const id = idParam(req, 'id');
  const result = await withTransaction((db) => withdrawApplication(viewer.id, id, db));
  res.json(result);
});

void getPool;
