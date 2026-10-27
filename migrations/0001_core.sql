-- Nuffy: ядро — пользователи, сессии, публикации, комментарии, реакции, подписки, уведомления.
-- Все объекты создаются с IF NOT EXISTS (идемпотентно, повторный запуск безопасен).
-- Идентификаторы — TEXT (UUID, генерируется приложением): максимально переносимо.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT UNIQUE,
  username TEXT,
  username_lower TEXT UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'limited', 'banned')),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  reputation INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  onboarded_at TIMESTAMPTZ,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_created_idx ON users (created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT 'slate',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'discussion', 'article', 'question', 'poll', 'team',
    'event', 'vacancy', 'project', 'goal', 'checklist'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden', 'removed')),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  comment_count INTEGER NOT NULL DEFAULT 0,
  reaction_score INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  -- Ссылка на принятый ответ без FK (циклическая зависимость comments → posts);
  -- целостность обеспечивается приложением и проверкой админ-панели.
  accepted_answer_id TEXT,
  published_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(title) >= 3 AND length(title) <= 300)
);
CREATE INDEX IF NOT EXISTS posts_feed_idx ON posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS posts_author_idx ON posts (author_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_category_idx ON posts (category_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS posts_type_idx ON posts (type, status, published_at DESC);
CREATE INDEX IF NOT EXISTS posts_activity_idx ON posts (status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS posts_draft_idx ON posts (author_id, created_at DESC) WHERE status = 'draft';

CREATE TABLE IF NOT EXISTS post_tags (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
CREATE INDEX IF NOT EXISTS post_tags_tag_idx ON post_tags (tag_id);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'removed')),
  is_accepted BOOLEAN NOT NULL DEFAULT false,
  reaction_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  CHECK (length(body) >= 1 AND length(body) <= 20000)
);
CREATE INDEX IF NOT EXISTS comments_post_idx ON comments (post_id, status, created_at);
CREATE INDEX IF NOT EXISTS comments_author_idx ON comments (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments (parent_id);

-- Единый голос «лайк/дизлайк»: одна строка = один пользователь на объект.
CREATE TABLE IF NOT EXISTS reactions (
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value SMALLINT NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (target_type, target_id, user_id)
);
CREATE INDEX IF NOT EXISTS reactions_user_idx ON reactions (user_id);
CREATE INDEX IF NOT EXISTS reactions_target_idx ON reactions (target_type, target_id);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS favorites_post_idx ON favorites (post_id);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows (followee_id);

CREATE TABLE IF NOT EXISTS tag_subscriptions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tag_id)
);

CREATE TABLE IF NOT EXISTS user_interests (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tag_id)
);

-- Скрытые из ленты: публикации, авторы и категории.
CREATE TABLE IF NOT EXISTS feed_hides (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'author', 'category')),
  target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_type, target_id)
);

-- Отслеживаемые публикации («следить за обсуждением»).
CREATE TABLE IF NOT EXISTS post_watches (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'comment', 'reply', 'mention', 'answer_accepted', 'application',
    'application_result', 'follow', 'achievement', 'system', 'watch_activity'
  )),
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_entity_idx ON notifications (entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_idx
  ON notifications (user_id, type, entity_type, entity_id, actor_id)
  WHERE actor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mentions (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('post', 'comment')),
  source_id TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentioned_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, mentioned_user_id)
);
CREATE INDEX IF NOT EXISTS mentions_user_idx ON mentions (mentioned_user_id, created_at DESC);
