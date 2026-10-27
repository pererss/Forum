import type { SessionUser } from '../../shared/types';

declare global {
  namespace Express {
    interface Request {
      /** Текущий пользователь (null — анонимный запрос). Заполняется attachSession. */
      user?: SessionUser | null;
      /** Токен сессии из cookie (нужен для обновления/удаления). */
      sessionToken?: string | null;
      /** Хэш текущей сессии для операций с sessions. */
      sessionId?: string | null;
    }
  }
}

export {};
