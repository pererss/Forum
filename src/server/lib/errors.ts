// Единый тип ошибок приложения. Сообщения безопасны для показа пользователю.

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string[]> | undefined;

  constructor(status: number, code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: Record<string, string[]>) =>
  new AppError(400, 'bad_request', message, details);

export const unauthorized = (message = 'Требуется вход в аккаунт.') =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'Недостаточно прав для этого действия.') =>
  new AppError(403, 'forbidden', message);

export const notFound = (message = 'Материал не найден.') => new AppError(404, 'not_found', message);

export const conflict = (message: string) => new AppError(409, 'conflict', message);

export const tooManyRequests = (message = 'Слишком много запросов. Попробуйте позже.') =>
  new AppError(429, 'rate_limited', message);

export const serviceUnavailable = (message: string, code = 'service_unavailable') =>
  new AppError(503, code, message);
