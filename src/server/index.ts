import { env } from './env';
import { createApp } from './app';
import { attachFrontend } from './frontend';
import { closePool } from './db/pool';
import { dbState, ensureDbReady } from './db/ready';

const app = createApp();
await attachFrontend(app);

const server = app.listen(env.port, () => {
  console.log(
    `[nuffy] сервер запущен: http://localhost:${env.port} (${env.isProd ? 'production' : 'development'})`,
  );
  console.log(`[nuffy] база: ${env.databaseUrl ? 'конфигурация найдена' : 'НЕ НАСТРОЕНА (см. README)'}`);
  if (!env.google.configured) {
    console.log('[nuffy] Google OAuth не настроен — вход через Google покажет состояние «не настроен».');
  }
  console.log(
    `[nuffy] тестовый вход в разработке: ${env.devLoginEnabled ? 'включён' : 'выключен'}${env.isProd && env.devLoginEnabled ? ' (!)' : ''}`,
  );
});

// Неблокирующий прогрев: подключение + миграции. При ошибке сервер продолжает
// работать и отвечает безопасной ошибкой до восстановления.
void ensureDbReady().then((ok) => {
  if (ok) {
    console.log('[nuffy] база данных готова, миграции применены');
  } else {
    console.warn(`[nuffy] база не готова: ${dbState().message}`);
  }
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[nuffy] остановка (${signal})...`);
  server.close();
  await closePool().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
