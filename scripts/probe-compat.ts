// Проверка совместимости SQL-возможностей с TiDB Cloud PostgreSQL Compatible.
// Создаёт временные таблицы ТОЛЬКО в схеме nuffy_test и удаляет их в конце.
// Пароль и строка подключения не выводятся.

import pg from 'pg';
import { requireDatabaseUrl } from '../src/server/env';

const { Pool } = pg;

const TEST_SCHEMA = 'nuffy_test';
const results: { name: string; ok: boolean; note: string }[] = [];

async function check(name: string, fn: () => Promise<string | void>): Promise<void> {
  try {
    const note = (await fn()) ?? '';
    results.push({ name, ok: true, note });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, note: raw.split('\n')[0]!.slice(0, 140) });
  }
}

const pool = new Pool({
  connectionString: requireDatabaseUrl(),
  ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  max: 2,
  options: `-c search_path=${TEST_SCHEMA}`,
});

const query = (text: string, params?: unknown[]) => pool.query(text, params);

try {
  await check('схема nuffy_test + search_path (startup options)', async () => {
    await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`);
    const res = await query('SELECT current_schema() AS s');
    const schema = String(res.rows[0]!.s);
    if (schema !== TEST_SCHEMA) throw new Error(`current_schema() = ${schema}, ожидалось ${TEST_SCHEMA}`);
    return `current_schema()=${schema}`;
  });

  await check('CREATE TABLE: text pk, bool, int, bigint, jsonb, timestamptz, check', async () => {
    await query('DROP TABLE IF EXISTS probe_c');
    await query('DROP TABLE IF EXISTS probe_t');
    await query(`
      CREATE TABLE probe_t (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        flag BOOLEAN NOT NULL DEFAULT FALSE,
        n INTEGER NOT NULL DEFAULT 0,
        score BIGINT NOT NULL DEFAULT 0,
        data JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT probe_t_n_check CHECK (n >= 0)
      )
    `);
    return 'ok';
  });

  await check('обычный, уникальный, частичный и выражение-индекс', async () => {
    await query('CREATE INDEX probe_t_title_idx ON probe_t (title)');
    await query('CREATE UNIQUE INDEX probe_t_slug_uq ON probe_t (slug)');
    await query('CREATE INDEX probe_t_flag_n_idx ON probe_t (n) WHERE flag');
    await query('CREATE INDEX probe_t_lower_title_idx ON probe_t (lower(title))');
    return '4 индекса созданы';
  });

  await check('INSERT + DEFAULT + RETURNING', async () => {
    const res = await query(
      `INSERT INTO probe_t (id, title, slug, data) VALUES ($1, $2, $3, $4) RETURNING n, created_at`,
      ['t1', 'Привет', 'privet', JSON.stringify({ k: 'v', num: 5 })],
    );
    if (!res.rows[0]) throw new Error('нет строки в RETURNING');
    return `n=${res.rows[0].n}`;
  });

  await check('INSERT ... ON CONFLICT DO UPDATE + RETURNING (upsert)', async () => {
    const res = await query(
      `INSERT INTO probe_t (id, title, slug) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET n = probe_t.n + 1 RETURNING n`,
      ['t1', 'Привет', 'privet'],
    );
    const n = Number(res.rows[0]!.n);
    if (n !== 1) throw new Error(`ожидалось n=1, получено ${n}`);
    return 'счётчик увеличился';
  });

  await check('jsonb: чтение поля через ->>', async () => {
    const res = await query(`SELECT data->>'k' AS v FROM probe_t WHERE id = 't1'`);
    if (res.rows[0]!.v !== 'v') throw new Error(`получено ${String(res.rows[0]!.v)}`);
    return 'ok';
  });

  await check('jsonb: оператор @> (содержание)', async () => {
    const res = await query(`SELECT count(*)::int AS c FROM probe_t WHERE data @> $1::jsonb`, [
      JSON.stringify({ k: 'v' }),
    ]);
    return `matched=${res.rows[0]!.c}`;
  });

  await check('ILIKE (регистронезависимый поиск)', async () => {
    const res = await query(`SELECT count(*)::int AS c FROM probe_t WHERE title ILIKE $1`, ['%привет%']);
    if (Number(res.rows[0]!.c) !== 1) throw new Error('ILIKE не нашёл строку');
    return 'ok';
  });

  await check('NULLS LAST в ORDER BY', async () => {
    await query(`SELECT id FROM probe_t ORDER BY title NULLS LAST`);
    return 'ok';
  });

  await check('EXTRACT(EPOCH FROM now() - created_at)', async () => {
    const res = await query(`SELECT EXTRACT(EPOCH FROM (now() - created_at)) AS e FROM probe_t LIMIT 1`);
    return `epoch=${Number(res.rows[0]!.e).toFixed(2)}`;
  });

  await check('date_trunc(по дням)', async () => {
    const res = await query(`SELECT date_trunc('day', created_at) AS d FROM probe_t LIMIT 1`);
    return `день=${String(res.rows[0]!.d).slice(0, 10)}`;
  });

  await check('string_agg / array_agg', async () => {
    const res = await query(
      `SELECT string_agg(title, ',') AS s, array_agg(title) AS a FROM probe_t`,
    );
    const arr = res.rows[0]!.a;
    if (!Array.isArray(arr)) throw new Error('array_agg вернул не массив');
    return 'ok';
  });

  await check('CTE + оконная функция ROW_NUMBER', async () => {
    const res = await query(`
      WITH r AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY n DESC) AS rn
        FROM probe_t
      )
      SELECT count(*)::int AS c FROM r WHERE rn = 1
    `);
    return `rows=${res.rows[0]!.c}`;
  });

  await check('DISTINCT ON', async () => {
    const res = await query(`SELECT DISTINCT ON (slug) id FROM probe_t ORDER BY slug, n DESC`);
    return `rows=${res.rowCount ?? 0}`;
  });

  await check('FK с ON DELETE CASCADE + проверка ссылок', async () => {
    await query(`
      CREATE TABLE probe_c (
        id TEXT PRIMARY KEY,
        t_id TEXT NOT NULL REFERENCES probe_t(id) ON DELETE CASCADE
      )
    `);
    await query(`INSERT INTO probe_c (id, t_id) VALUES ('c1', 't1')`);
    let enforced = false;
    try {
      await query(`INSERT INTO probe_c (id, t_id) VALUES ('c2', 'missing')`);
    } catch {
      enforced = true; // нарушение FK поймано — значит, ограничение реально работает
    }
    if (!enforced) throw new Error('FK не блокирует битую ссылку');
    await query(`DELETE FROM probe_t WHERE id = 't1'`);
    const res = await query(`SELECT count(*)::int AS c FROM probe_c`);
    if (Number(res.rows[0]!.c) !== 0) throw new Error('CASCADE не удалил дочерние строки');
    return 'FK выполняется, каскад работает';
  });

  await check('транзакция: ROLLBACK', async () => {
    await query('BEGIN');
    await query(`INSERT INTO probe_t (id, title, slug) VALUES ('tx', 'tx', 'tx')`);
    await query('ROLLBACK');
    const res = await query(`SELECT count(*)::int AS c FROM probe_t WHERE id = 'tx'`);
    if (Number(res.rows[0]!.c) !== 0) throw new Error('ROLLBACK не откатил вставку');
    return 'ok';
  });

  await check('SELECT ... FOR UPDATE', async () => {
    await query('BEGIN');
    const res = await query(`SELECT id FROM probe_t FOR UPDATE`);
    await query('COMMIT');
    return `rows=${res.rowCount ?? 0}`;
  });

  await check('UPDATE ... RETURNING', async () => {
    await query(`INSERT INTO probe_t (id, title, slug) VALUES ('t1', 'Привет', 'privet')`);
    const res = await query(`UPDATE probe_t SET title = title WHERE id = $1 RETURNING id`, ['t1']);
    if (!res.rows[0]) throw new Error('нет строки');
    return 'ok';
  });
} finally {
  await query('DROP TABLE IF EXISTS probe_c').catch(() => {});
  await query('DROP TABLE IF EXISTS probe_t').catch(() => {});
  await pool.end();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} | ${r.name}${r.note ? ` — ${r.note}` : ''}`);
}
console.log(`\nИтог: ${results.length - failed.length}/${results.length} проверок пройдено.`);
if (failed.length > 0) process.exitCode = 1;
