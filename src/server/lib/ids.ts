import { randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

/** Проверка, что строка — корректный UUID (для путей API). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isId(value: string): boolean {
  return UUID_RE.test(value);
}

/** Безопасное превращение произвольного текста в ярлык для ссылок/поиска. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
