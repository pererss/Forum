// API-клиент: единая точка запросов, обработка ошибок, учёт сессионной cookie.

import type { ApiErrorBody } from '@/shared/types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, string[]> | undefined;

  constructor(status: number, code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal,
    });
  } catch {
    throw new ApiError(0, 'network', 'Нет связи с сервером. Проверьте подключение и попробуйте снова.');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorBody = payload as ApiErrorBody | null;
    const error = errorBody?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'unknown',
      error?.message ?? `Ошибка запроса (${response.status}).`,
      error?.details,
    );
  }
  return payload as T;
}

export const apiGet = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const apiPost = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body });
export const apiPatch = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body });
export const apiPut = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body });
export const apiDelete = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'DELETE', body });
