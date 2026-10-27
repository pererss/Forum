// Одноразовое применение миграций: npm run migrate

import { runMigrations } from '../src/server/db/migrate';
import { closePool } from '../src/server/db/pool';
import { describeDatabase } from '../src/server/env';

try {
  console.log(`[migrate] база: ${describeDatabase()}`);
  const outcome = await runMigrations();
  if (outcome.applied.length > 0) {
    console.log(`[migrate] применено: ${outcome.applied.join(', ')}`);
  }
  console.log(
    `[migrate] готово. Всего миграций: ${outcome.applied.length + outcome.alreadyApplied.length} (уже были: ${outcome.alreadyApplied.length}).`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[migrate] ошибка: ${message.split('\n')[0]?.slice(0, 300)}`);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
