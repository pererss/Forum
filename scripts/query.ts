// Read-only CLI для запросов к базе: npx tsx scripts/query.ts "SELECT ..."
// Запросы на изменение (INSERT/UPDATE/DELETE/DDL) отклоняются.

import { closePool, getPool } from '../src/server/db/pool';
import { describeDatabase } from '../src/server/env';

const sql = process.argv.slice(2).join(' ').trim();

if (!sql) {
  console.error('Укажите запрос на чтение. Пример: npx tsx scripts/query.ts "SELECT 1 AS ok"');
  process.exit(1);
}

if (!/^\s*(select|with|show|explain)\b/i.test(sql)) {
  console.error('Разрешены только запросы на чтение (SELECT / WITH / SHOW / EXPLAIN).');
  process.exit(1);
}

try {
  console.error(`[query] ${describeDatabase()}`);
  const result = await getPool().query(sql);
  const output = JSON.stringify(result.rows, null, 2);
  console.log(output.length > 30_000 ? `${output.slice(0, 30_000)}\n... (обрезано)` : output);
  console.error(`[query] строк: ${result.rowCount ?? result.rows.length}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[query] ошибка: ${message.split('\n')[0]?.slice(0, 300)}`);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
