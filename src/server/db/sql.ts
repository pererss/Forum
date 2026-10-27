// Тонкая обёртка над pg: параметризованные запросы, транзакции, безопасные ошибки.

import type pg from 'pg';
import type { QueryResultRow } from 'pg';
import { getPool } from './pool';

export type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<T>>;
};

export async function rows<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
  db: Queryable = getPool(),
): Promise<T[]> {
  const result = await db.query<T>(text, params);
  return result.rows;
}

/** Выполняет запрос без возврата строк (UPDATE/DELETE и т.п.). */
export async function query(text: string, params?: unknown[], db: Queryable = getPool()): Promise<void> {
  await db.query(text, params);
}

export async function one<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
  db: Queryable = getPool(),
): Promise<T | null> {
  const result = await db.query<T>(text, params);
  return result.rows[0] ?? null;
}

export async function oneRequired<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
  db: Queryable = getPool(),
): Promise<T> {
  const found = await one<T>(text, params, db);
  if (!found) throw new Error('Ожидаемая запись не найдена.');
  return found;
}

/** Выполняет функцию внутри транзакции; при ошибке — ROLLBACK. */
export async function withTransaction<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // соединение могло оборваться — основная ошибка важнее
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Короткий идентификатор для логов запросов (без содержимого данных). */
export function shortErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return 'UNKNOWN';
}
