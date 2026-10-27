// Состояние готовности базы: сервер может запускаться без конфигурации БД
// и отвечать понятной безопасной ошибкой, а не падать или раскрывать секреты.

import { env } from '../env';
import { runMigrations } from './migrate';

export type DbState = {
  ready: boolean;
  code: 'db_not_configured' | 'db_unavailable' | null;
  message: string | null;
  lastAttemptAt: number;
};

const RETRY_INTERVAL_MS = 5_000;

let state: DbState = {
  ready: false,
  code: null,
  message: null,
  lastAttemptAt: 0,
};

export function dbState(): DbState {
  return state;
}

/** Убирает пароль из текста ошибки подключения (на всякий случай). */
function sanitize(message: string): string {
  let safe = message;
  if (env.databaseUrl) {
    try {
      const url = new URL(env.databaseUrl);
      const secret = decodeURIComponent(url.password);
      if (secret) safe = safe.split(secret).join('***');
    } catch {
      // строка не разобрана — нечего маскировать
    }
  }
  return safe;
}

/**
 * Проверяет/приводит базу в состояние готовности (миграции применяются автоматически).
 * При недоступности повторяет попытку не чаще одного раза в 5 секунд.
 */
export async function ensureDbReady(): Promise<boolean> {
  if (state.ready) return true;

  if (!env.databaseUrl) {
    state = {
      ready: false,
      code: 'db_not_configured',
      message:
        'База данных не настроена. Заполните DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER и DATABASE_PASSWORD в файле .env.local (инструкция в README).',
      lastAttemptAt: Date.now(),
    };
    return false;
  }

  const now = Date.now();
  if (now - state.lastAttemptAt < RETRY_INTERVAL_MS) return false;
  state.lastAttemptAt = now;

  try {
    await runMigrations();
    state = { ready: true, code: null, message: null, lastAttemptAt: now };
    return true;
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const firstLine = sanitize(raw).split('\n')[0] ?? 'ошибка подключения';
    state = {
      ready: false,
      code: 'db_unavailable',
      message: `База данных временно недоступна: ${firstLine.slice(0, 200)}`,
      lastAttemptAt: now,
    };
    console.error('[db] недоступна:', firstLine.slice(0, 200));
    return false;
  }
}
