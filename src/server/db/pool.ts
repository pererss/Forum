import pg from 'pg';
import { env, requireDatabaseUrl } from '../env';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const schema = env.databaseSchema;
  pool = new Pool({
    connectionString: requireDatabaseUrl(),
    ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 12_000,
    application_name: 'nuffy',
    // Изоляция схемы нужна тестам; публичная схема не требует переопределений.
    ...(schema !== 'public' ? { options: `-c search_path=${schema}` } : {}),
  });
  pool.on('error', (error) => {
    console.error('[db] idle client error:', error.message);
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Безопасная проверка соединения: возвращает только не-секретные факты. */
export async function pingDatabase(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const started = Date.now();
  try {
    await getPool().query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'неизвестная ошибка';
    return { ok: false, error: message.split('\n')[0]?.slice(0, 180) ?? 'ошибка подключения' };
  }
}
