// Временный инструмент разработки: назначает роль пользователю.
// Использование: npx tsx scripts/set-role.ts <username> <user|moderator|admin>
// Все изменения пишутся в admin_logs (если журнал доступен).

import { one, query } from '../src/server/db/sql';
import { closePool } from '../src/server/db/pool';

const [username, role] = process.argv.slice(2);

if (!username || !['user', 'moderator', 'admin'].includes(role ?? '')) {
  console.error('Использование: npx tsx scripts/set-role.ts <username> <user|moderator|admin>');
  process.exit(1);
}

try {
  const updated = await one<{ id: string; role: string }>(
    `UPDATE users SET role = $2, updated_at = now()
     WHERE username_lower = $1
     RETURNING id, role`,
    [username.toLowerCase(), role],
  );
  if (!updated) {
    console.error(`Пользователь "${username}" не найден.`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${username} → ${role} (id ${updated.id})`);
  }
} catch (error) {
  console.error('Ошибка:', error instanceof Error ? error.message.split('\n')[0] : error);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}

void query;
