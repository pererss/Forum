// Нормализация идентификаторов: теги, slug, username.
// Возвращает одинаковый результат для одинаковых значений независимо от регистра.

/** Нижний регистр + тире вместо пробелов; поддержка кириллицы. */
export function normalizeTagSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Человекочитаемое имя тега: сохраняет регистр ввода, схлопывает пробелы. */
export function normalizeTagName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, 40);
}

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export const USERNAME_RE = /^[a-z0-9][a-z0-9_.-]{1,22}[a-z0-9]$/i;

export function isValidUsername(input: string): boolean {
  return USERNAME_RE.test(input);
}

/** Первые буквы имени для аватара-заглушки. */
export function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** Стабильный «цветовой отпечаток» пользователя/объекта для иллюстративных аватаров. */
export function stableHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}
