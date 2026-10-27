// Загрузка переменных окружения: .env.local приоритетнее .env.
// Реальные значения окружения (shell) не перезаписываются.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseEnvFile(file: string): void {
  if (!existsSync(file)) return;
  const raw = readFileSync(file, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = trimmed.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value[0] === '"' && value.endsWith('"')) || (value[0] === "'" && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

parseEnvFile(path.join(ROOT, '.env'));
parseEnvFile(path.join(ROOT, '.env.local'));

const isProd = process.env.NODE_ENV === 'production';

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

const host = process.env.DATABASE_HOST?.trim();
const user = process.env.DATABASE_USER?.trim();
const password = process.env.DATABASE_PASSWORD;
const database = process.env.DATABASE_NAME?.trim();
const port = process.env.DATABASE_PORT?.trim() ?? '5432';

let composedUrl: string | null = null;
if (host && user && password && database) {
  composedUrl = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

const databaseUrl = process.env.DATABASE_URL?.trim() || composedUrl;

export const env = {
  isProd,
  root: ROOT,
  port: Number(process.env.PORT ?? 4000) || 4000,
  databaseUrl,
  databaseSchema: process.env.DATABASE_SCHEMA?.trim() || 'public',
  adminEmails: parseList(process.env.ADMIN_EMAILS),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 14) || 14,
  // Тестовый вход возможен только вне production и только при явном флаге.
  devLoginEnabled: !isProd && process.env.ENABLE_DEV_LOGIN === 'true',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
    get configured(): boolean {
      return Boolean(this.clientId && this.clientSecret);
    },
  },
  allowedOrigins: parseList(process.env.ALLOWED_ORIGINS),
} as const;

/** Маскированное описание подключения — безопасно для логов и диагностики. */
export function describeDatabase(): string {
  if (!env.databaseUrl) return 'не настроена';
  try {
    const url = new URL(env.databaseUrl);
    // Никогда не показываем логин, пароль и хост: только имя базы и схемы.
    return `база «${url.pathname.slice(1) || 'postgres'}» (схема: ${env.databaseSchema})`;
  } catch {
    return `схема: ${env.databaseSchema}`;
  }
}

export function requireDatabaseUrl(): string {
  if (!env.databaseUrl) {
    throw new Error(
      'База данных не настроена. Заполните DATABASE_HOST/DATABASE_PORT/DATABASE_NAME/DATABASE_USER/DATABASE_PASSWORD (или DATABASE_URL) в .env.local — см. README.',
    );
  }
  return env.databaseUrl;
}
