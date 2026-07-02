CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  label TEXT,
  created_at TEXT NOT NULL,
  active_workspace_id TEXT,
  auth_token TEXT
);

CREATE TABLE IF NOT EXISTS device_workspaces (
  device_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (device_id, workspace_id),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS join_tokens (
  token TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  created_by_device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (created_by_device_id) REFERENCES devices(id)
);

CREATE TABLE IF NOT EXISTS registry_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_workspaces_workspace
  ON device_workspaces(workspace_id);

CREATE INDEX IF NOT EXISTS idx_join_tokens_workspace
  ON join_tokens(workspace_id);
