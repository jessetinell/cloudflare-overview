-- Small JSON blobs: latest inventory, usage, findings.
CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
-- Month-to-date cost per project at each sync, for spike + daily-cap detection. Pruned after 35 days.
CREATE TABLE samples (at TEXT NOT NULL, project TEXT NOT NULL, gross REAL NOT NULL, net REAL NOT NULL, PRIMARY KEY (at, project));
-- Budgets. project '*' = whole account.
CREATE TABLE budgets (project TEXT PRIMARY KEY, monthly REAL, daily REAL, autostop INTEGER NOT NULL DEFAULT 0);
-- Manual project placement: resource key -> project name.
CREATE TABLE overrides (resource TEXT PRIMARY KEY, project TEXT NOT NULL);
-- Emergency stop snapshots (what to restore on resume).
CREATE TABLE stops (project TEXT PRIMARY KEY, snapshot TEXT NOT NULL, at TEXT NOT NULL, reason TEXT NOT NULL);
-- Alert dedupe: one alert per key (project:kind:day).
CREATE TABLE alerts (key TEXT PRIMARY KEY, at TEXT NOT NULL, message TEXT NOT NULL);
-- Single-run locks for cron / manual refresh.
CREATE TABLE locks (name TEXT PRIMARY KEY, until INTEGER NOT NULL);
