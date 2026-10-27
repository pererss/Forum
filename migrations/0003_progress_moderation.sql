-- Nuffy: прогресс пользователей, достижения, модерация, настройки платформы.

-- История опыта и репутации. Уникальный ключ защищает от повторного начисления
-- за одно и то же событие (source_type/source_id = '' для событий без источника).
CREATE TABLE IF NOT EXISTS progress_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  xp_delta INTEGER NOT NULL DEFAULT 0,
  rep_delta INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL DEFAULT '',
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS progress_events_user_idx ON progress_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'sparkles',
  color TEXT NOT NULL DEFAULT 'accent',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'user')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'offtopic', 'misinfo', 'other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected')),
  handled_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_logs_created_idx ON admin_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_logs_admin_idx ON admin_logs (admin_id, created_at DESC);

-- Ключевые настройки платформы: правила XP, пороги уровней, параметры ленты и т.д.
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Сохранённые пользователем фильтры ленты/поиска.
CREATE TABLE IF NOT EXISTS saved_filters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_filters_user_idx ON saved_filters (user_id);
