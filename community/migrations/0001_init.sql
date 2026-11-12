-- The community board. No IP address, email or account is stored anywhere in this database.
CREATE TABLE posts (
  id TEXT PRIMARY KEY,                 -- random, 12 characters
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',       -- the display name; empty shows "Anonymous"
  product TEXT NOT NULL CHECK (product IN ('text-to-robot', 'robot-studio')),
  recipe TEXT NOT NULL,                -- the share-link hash: make=... or robot=...
  tags TEXT NOT NULL DEFAULT '',       -- comma separated, lower case
  thumb BLOB NOT NULL,
  thumb_type TEXT NOT NULL CHECK (thumb_type IN ('png', 'webp')),
  status TEXT NOT NULL CHECK (status IN ('live', 'pending', 'hidden')),
  hidden_reason TEXT,                  -- 'reports' or 'owner' when hidden
  reviewed INTEGER NOT NULL DEFAULT 0, -- 1 once the owner restored or approved it: reports then wait for the owner
  delete_hash TEXT NOT NULL,           -- SHA-256 of the poster's private delete token
  poster_hash TEXT NOT NULL,           -- the rate-limit hash of the day it was posted (salt expires after two days)
  content_key TEXT NOT NULL,           -- SHA-256 of the normalised text and design, for duplicate detection
  created_at INTEGER NOT NULL          -- milliseconds since 1970, UTC
);
CREATE INDEX posts_feed ON posts (status, created_at DESC, id DESC);
CREATE INDEX posts_product ON posts (product, status, created_at DESC);
CREATE INDEX posts_content ON posts (content_key);

CREATE TABLE post_tags (post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, tag TEXT NOT NULL, PRIMARY KEY (post_id, tag));
CREATE INDEX post_tags_tag ON post_tags (tag);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  reporter_hash TEXT NOT NULL,         -- the reporter's rate-limit hash: one report per visitor per post
  resolved INTEGER NOT NULL DEFAULT 0, -- 1 once the owner restored or approved the post
  created_at INTEGER NOT NULL,
  UNIQUE (post_id, reporter_hash)
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO settings (key, value) VALUES ('moderation', 'instant'), ('report_threshold', '3');
