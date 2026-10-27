// Раннер миграций: применяет migrations/*.sql в алфавитном порядке и записывает
// выполненные файлы в таблицу _migrations. Все DDL в файлах идемпотентны (IF NOT EXISTS),
// поэтому частичное применение безопасно при повторном запуске.
// Транзакции вокруг DDL не оборачиваем: DDL-семантика TiDB может неявно фиксировать изменения.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { env } from '../env';
import { getPool } from './pool';

const SCHEMA_NAME_RE = /^[a-z_][a-z0-9_]*$/i;

export type MigrationOutcome = {
  applied: string[];
  alreadyApplied: string[];
  changed: string[];
};

export async function runMigrations(): Promise<MigrationOutcome> {
  const schema = env.databaseSchema;
  if (!SCHEMA_NAME_RE.test(schema)) {
    throw new Error('DATABASE_SCHEMA содержит недопустимые символы.');
  }

  const pool = getPool();
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL DEFAULT '',
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  );

  const appliedRows = await pool.query<{ id: string; checksum: string }>(
    'SELECT id, checksum FROM _migrations',
  );
  const applied = new Map(appliedRows.rows.map((row) => [row.id, row.checksum]));

  const dir = path.join(env.root, 'migrations');
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const outcome: MigrationOutcome = { applied: [], alreadyApplied: [], changed: [] };

  for (const file of files) {
    const sql = readFileSync(path.join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex').slice(0, 40);
    const previous = applied.get(file);

    if (previous !== undefined) {
      outcome.alreadyApplied.push(file);
      if (previous && previous !== checksum) outcome.changed.push(file);
      continue;
    }

    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (id, checksum) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [
      file,
      checksum,
    ]);
    outcome.applied.push(file);
  }

  if (outcome.changed.length > 0) {
    console.warn(
      `[migrate] внимание: применённые миграции изменены после запуска: ${outcome.changed.join(', ')}. Новые версии не применяются автоматически — создайте новую миграцию.`,
    );
  }

  return outcome;
}
