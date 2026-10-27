-- Nuffy: структурированные форматы публикаций (опросы, команды, события, вакансии, проекты, цели, чек-листы).

CREATE TABLE IF NOT EXISTS polls (
  post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  closes_at TIMESTAMPTZ,
  show_results_after_vote BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  total_votes INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS poll_options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES polls(post_id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  votes_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS poll_options_poll_idx ON poll_options (poll_id, position);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id TEXT NOT NULL REFERENCES polls(post_id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);
CREATE INDEX IF NOT EXISTS poll_votes_option_idx ON poll_votes (option_id);

-- Поиск команды: роли проекта с лимитами мест.
CREATE TABLE IF NOT EXISTS project_roles (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 0),
  filled INTEGER NOT NULL DEFAULT 0 CHECK (filled >= 0),
  position INTEGER NOT NULL DEFAULT 0,
  CHECK (filled <= capacity)
);
CREATE INDEX IF NOT EXISTS project_roles_post_idx ON project_roles (post_id, position);

-- Заявки — отдельная сущность: получено / принято / свободно считаются раздельно.
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES project_roles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id),
  CHECK (length(message) >= 3 AND length(message) <= 4000)
);
CREATE INDEX IF NOT EXISTS applications_post_status_idx ON applications (post_id, status);
CREATE INDEX IF NOT EXISTS applications_user_idx ON applications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS applications_role_idx ON applications (role_id, status);

CREATE TABLE IF NOT EXISTS events (
  post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  format TEXT NOT NULL DEFAULT 'offline' CHECK (format IN ('offline', 'online')),
  location TEXT,
  online_url TEXT,
  capacity INTEGER,
  going_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  CHECK (capacity IS NULL OR capacity > 0)
);

CREATE TABLE IF NOT EXISTS event_attendees (
  event_id TEXT NOT NULL REFERENCES events(post_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'maybe')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- Объявления и вакансии: только информационные, без платёжных данных.
CREATE TABLE IF NOT EXISTS vacancies (
  post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  company TEXT,
  employment TEXT,
  compensation TEXT,
  contact_method TEXT NOT NULL DEFAULT 'comments' CHECK (contact_method IN ('comments', 'profile', 'external')),
  external_url TEXT,
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS portfolio_projects (
  post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  project_status TEXT NOT NULL DEFAULT 'idea' CHECK (project_status IN (
    'idea', 'development', 'testing', 'launched', 'paused', 'archived'
  )),
  external_url TEXT,
  tech JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS goals (
  post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  target_value NUMERIC NOT NULL,
  current_value NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '',
  deadline TIMESTAMPTZ,
  CHECK (target_value > 0 AND current_value >= 0)
);

CREATE TABLE IF NOT EXISTS goal_milestones (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(post_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goal_milestones_goal_idx ON goal_milestones (goal_id, position);

-- Совместный чек-лист: доступ редактирования явно выдаётся автором.
CREATE TABLE IF NOT EXISTS checklist_items (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(text) >= 1 AND length(text) <= 1000)
);
CREATE INDEX IF NOT EXISTS checklist_items_post_idx ON checklist_items (post_id, position);

CREATE TABLE IF NOT EXISTS post_collaborators (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'edit' CHECK (permission IN ('edit', 'view')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- Включённые/выключенные форматы публикаций (настраиваются в админке).
CREATE TABLE IF NOT EXISTS post_type_settings (
  type TEXT PRIMARY KEY CHECK (type IN (
    'discussion', 'article', 'question', 'poll', 'team',
    'event', 'vacancy', 'project', 'goal', 'checklist'
  )),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'message-circle',
  color TEXT NOT NULL DEFAULT 'slate',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
