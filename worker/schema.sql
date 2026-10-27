CREATE TABLE IF NOT EXISTS progress (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  data BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS progress_updated_at ON progress (updated_at);
