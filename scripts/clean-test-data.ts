// Удаление тестовых данных из рабочей схемы.
// По умолчанию удаляет аккаунты smoke_* (и всё, что на них ссылается через CASCADE),
// а также демонстрационную публикацию ручной проверки интерфейса.
//
// Запуск: npm run clean:test
// Аккаунт smoketest (локальный администратор для dev-входа) НЕ удаляется.
// Для его удаления: npx tsx scripts/clean-test-data.ts --include-dev-account

import { closePool } from '../src/server/db/pool';
import { rows, query } from '../src/server/db/sql';
import { ensureDbReady } from '../src/server/db/ready';
import { env, describeDatabase } from '../src/server/env';

const includeDevAccount = process.argv.includes('--include-dev-account');

if (env.isProd) {
  console.error('[clean] отказ: скрипт не запускается в production.');
  process.exit(1);
}

try {
  console.log(`[clean] база: ${describeDatabase()}`);
  if (!(await ensureDbReady())) {
    throw new Error('База данных недоступна.');
  }

  const smokeUsers = await rows<{ id: string; username: string | null }>(
    "SELECT id, username FROM users WHERE username LIKE 'smoke\\_%' ESCAPE '\\'",
  );
  if (smokeUsers.length > 0) {
    await query(
      "DELETE FROM users WHERE username LIKE 'smoke\\_%' ESCAPE '\\'",
    );
    console.log(`[clean] удалено тестовых аккаунтов: ${smokeUsers.length} (${smokeUsers.map((u) => u.username).join(', ')})`);
  } else {
    console.log('[clean] тестовых аккаунтов smoke_* нет.');
  }

  const demoPosts = await rows<{ id: string }>(
    "SELECT id FROM posts WHERE title LIKE 'Проверка интерфейса Nuffy%'",
  );
  if (demoPosts.length > 0) {
    await query("DELETE FROM posts WHERE title LIKE 'Проверка интерфейса Nuffy%'");
    console.log(`[clean] удалено демонстрационных публикаций: ${demoPosts.length}`);
  }

  if (includeDevAccount) {
    await query("DELETE FROM users WHERE username = 'smoketest'");
    console.log('[clean] удалён локальный аккаунт smoketest.');
  }

  const remaining = await rows<{ count: string }>(
    "SELECT count(*) AS count FROM users WHERE username LIKE 'smoke\\_%' ESCAPE '\\'",
  );
  console.log(`[clean] готово. Осталось smoke_* аккаунтов: ${remaining[0]?.count ?? 0}.`);
} catch (error) {
  console.error(`[clean] ошибка: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
