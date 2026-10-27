// Парсинг и сериализация cookie без внешних зависимостей.

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export type CookieOptions = {
  httpOnly?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
  maxAgeSeconds?: number;
  path?: string;
  expires?: Date;
};

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${options.maxAgeSeconds}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${options.sameSite ?? 'lax'}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}
