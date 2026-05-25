CREATE TABLE IF NOT EXISTS computers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  persona TEXT NOT NULL,
  mode TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  computer_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  repo TEXT NOT NULL DEFAULT '',
  artifact TEXT,
  result TEXT NOT NULL DEFAULT '{}',
  input TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  snapshot_key TEXT,
  forked_from TEXT,
  expires_at TEXT,
  FOREIGN KEY (computer_id) REFERENCES computers(id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS computer_repo_grants (
  owner_id TEXT NOT NULL,
  computer_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('git_repo_read', 'git_repo_write')),
  repo_key TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, computer_id, kind, repo_key)
);
