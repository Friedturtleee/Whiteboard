CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  cleanup_pending INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_pending IN (0, 1)),
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS board_members (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  email_address TEXT,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (board_id, user_id)
);

CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY NOT NULL,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS connect_tickets (
  token_hash TEXT PRIMARY KEY NOT NULL,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  share_link_id TEXT REFERENCES share_links(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_boards_owner_updated
  ON boards(owner_user_id, deleted_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_members_user
  ON board_members(user_id, board_id);
CREATE INDEX IF NOT EXISTS idx_share_links_board
  ON share_links(board_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_connect_tickets_expiry
  ON connect_tickets(expires_at);
