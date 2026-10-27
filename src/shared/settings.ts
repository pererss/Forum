import type { NotificationType, UserSettings } from './types';

export const NOTIFICATION_TYPES: NotificationType[] = [
  'comment',
  'reply',
  'mention',
  'answer_accepted',
  'application',
  'application_result',
  'follow',
  'achievement',
  'system',
  'watch_activity',
];

export function defaultUserSettings(): UserSettings {
  const notify = Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, true]),
  ) as Record<NotificationType, boolean>;
  return {
    notify,
    privacy: { showActivity: true, showFollowing: true },
  };
}

/** Нормализует произвольный JSON настроек из базы до полного корректного объекта. */
export function normalizeSettings(raw: unknown): UserSettings {
  const defaults = defaultUserSettings();
  if (!raw || typeof raw !== 'object') return defaults;
  const source = raw as Partial<UserSettings>;
  const notify = { ...defaults.notify };
  if (source.notify && typeof source.notify === 'object') {
    for (const type of NOTIFICATION_TYPES) {
      const value = (source.notify as Record<string, unknown>)[type];
      if (typeof value === 'boolean') notify[type] = value;
    }
  }
  const privacy = { ...defaults.privacy };
  if (source.privacy && typeof source.privacy === 'object') {
    if (typeof source.privacy.showActivity === 'boolean') privacy.showActivity = source.privacy.showActivity;
    if (typeof source.privacy.showFollowing === 'boolean') privacy.showFollowing = source.privacy.showFollowing;
  }
  return { notify, privacy };
}

/** Применяет патч настроек поверх текущих (только известные поля). */
export function patchSettings(current: UserSettings, patch: unknown): UserSettings {
  if (!patch || typeof patch !== 'object') return current;
  const source = patch as {
    notify?: Record<string, unknown>;
    privacy?: Record<string, unknown>;
  };
  const merged = {
    notify: { ...current.notify },
    privacy: { ...current.privacy },
  };
  if (source.notify && typeof source.notify === 'object') {
    for (const type of NOTIFICATION_TYPES) {
      const value = source.notify[type];
      if (typeof value === 'boolean') merged.notify[type] = value;
    }
  }
  if (source.privacy && typeof source.privacy === 'object') {
    if (typeof source.privacy.showActivity === 'boolean') merged.privacy.showActivity = source.privacy.showActivity;
    if (typeof source.privacy.showFollowing === 'boolean') merged.privacy.showFollowing = source.privacy.showFollowing;
  }
  return merged;
}
