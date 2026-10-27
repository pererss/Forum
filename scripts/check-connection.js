// Проверка подключения к TiDB Cloud (PostgreSQL Compatible).
// - параметры читаются только из .env.local;
// - SSL/TLS обязателен, сертификат проверяется (rejectUnauthorized, TLS >= 1.2);
// - база не изменяется: выполняется лишь SELECT version();
// - пароль и полная строка подключения никогда не выводятся.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const ENV_PATH = join(ROOT_DIR, '.env.local');
const REQUIRED_KEYS = ['DATABASE_HOST', 'DATABASE_PORT', 'DATABASE_NAME', 'DATABASE_USER', 'DATABASE_PASSWORD'];

function exitWithError(message) {
  console.error(`Проверка не пройдена: ${message}`);
  process.exit(1);
}

function loadEnvLocal(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      exitWithError('файл .env.local не найден — скопируйте .env.example в .env.local и заполните значения.');
    }
    exitWithError('не удалось прочитать .env.local.');
  }

  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }
    values[key] = value;
  }
  return values;
}

// Убирает из текста всё чувствительное перед выводом.
function scrub(text, secrets) {
  let safe = String(text ?? '');
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join('***');
  }
  safe = safe.replace(/:\/\/[^\s'"]*@[^\s'"]*/g, '://***');
  safe = safe.replace(/\b(password|pwd|pass)\s*[=:]\s*\S+/gi, '$1=***');
  return safe.length > 240 ? `${safe.slice(0, 240)}...` : safe;
}

function describeError(error, secrets) {
  const code = error?.code;
  const message = String(error?.message ?? '');

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'не удалось разрешить имя хоста (DNS) — проверьте DATABASE_HOST.';
  }
  if (code === 'ECONNREFUSED') {
    return 'сервер отклонил соединение — проверьте DATABASE_PORT и доступность кластера.';
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || /timeout|timed out/i.test(message)) {
    return 'таймаут соединения — проверьте сеть, файрвол и IP Access List в TiDB Cloud.';
  }
  if (
    code === '28P01' ||
    code === '28000' ||
    /password authentication failed|authentication failed|access denied|no password/i.test(message)
  ) {
    return 'ошибка аутентификации — неверные DATABASE_USER или DATABASE_PASSWORD.';
  }
  if (code === '3D000' || /does not exist/i.test(message)) {
    return 'база данных не найдена — проверьте DATABASE_NAME.';
  }
  if (code === '42501' || /permission denied/i.test(message)) {
    return 'недостаточно прав для доступа к базе — проверьте пользователя и его права.';
  }
  if (
    code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
    code === 'CERT_HAS_EXPIRED' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    /ssl|tls|certificate|self[- ]signed|cert[_ ]has[_ ]expired|unable_to_verify|altname/i.test(message)
  ) {
    return 'ошибка проверки SSL/TLS-сертификата — убедитесь, что хост верный и трафик не перехватывает прокси.';
  }
  if (/connection terminated|ePIPE/i.test(message)) {
    return 'соединение неожиданно закрыто сервером — повторите попытку.';
  }

  const detail = scrub(message, secrets);
  const suffix = code ? ` (код ${code})` : '';
  return detail ? `ошибка подключения${suffix}: ${detail}` : `ошибка подключения${suffix}.`;
}

const env = loadEnvLocal(ENV_PATH);

const missing = REQUIRED_KEYS.filter((key) => !env[key]);
if (missing.length > 0) {
  exitWithError(`не заполнены переменные: ${missing.join(', ')} — отредактируйте .env.local.`);
}

const port = Number(env.DATABASE_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  exitWithError('DATABASE_PORT должен быть числом от 1 до 65535.');
}

const secrets = [env.DATABASE_PASSWORD];

const client = new pg.Client({
  host: env.DATABASE_HOST,
  port,
  database: env.DATABASE_NAME,
  user: env.DATABASE_USER,
  password: env.DATABASE_PASSWORD,
  ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  connectionTimeoutMillis: 15000,
});

console.log('Проверка подключения к TiDB Cloud (SSL/TLS)...');

try {
  await client.connect();
} catch (error) {
  exitWithError(describeError(error, secrets));
}

try {
  let version = null;
  try {
    const result = await client.query('SELECT version() AS version');
    version = result.rows?.[0]?.version ?? null;
  } catch {
    // Соединение уже установлено; версия сервера — вспомогательная информация.
  }

  console.log('Успешно: соединение установлено, сертификат SSL/TLS подтверждён.');
  console.log(`База: ${env.DATABASE_NAME} (порт ${port})`);
  if (version) console.log(`Сервер: ${version}`);
} finally {
  await client.end().catch(() => {});
}
