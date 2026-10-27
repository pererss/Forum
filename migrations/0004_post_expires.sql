-- Nuffy: срок актуальности публикации (нужен поиску команды; применяется и к другим типам).

ALTER TABLE posts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS posts_expires_idx ON posts (expires_at) WHERE expires_at IS NOT NULL;
