import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));

const UPDATED_AT_MIGRATION = `
ALTER TABLE groups ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));
`;

const UPDATED_AT_MIGRATION_ARTICLES = `
ALTER TABLE articles ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));
CREATE INDEX IF NOT EXISTS idx_articles_updated ON articles(updated_at);
`;

const FTS_TRIGGER_MIGRATION = `
DROP TRIGGER IF EXISTS articles_ad;
DROP TRIGGER IF EXISTS articles_au;
CREATE TRIGGER articles_ad AFTER DELETE ON articles BEGIN
  DELETE FROM articles_fts WHERE rowid = old.id;
END;
CREATE TRIGGER articles_au AFTER UPDATE ON articles BEGIN
  DELETE FROM articles_fts WHERE rowid = old.id;
  INSERT INTO articles_fts(rowid, entry_key, title, author, journal, notes, source, tags, group_id)
  VALUES (
    new.id,
    new.entry_key,
    COALESCE(json_extract(new.fields_json, '$.title'), ''),
    COALESCE(json_extract(new.fields_json, '$.author'), ''),
    COALESCE(json_extract(new.fields_json, '$.journal'), ''),
    new.notes,
    new.source,
    (SELECT group_concat(je.value, ' ') FROM json_each(new.tags_json) je),
    new.group_id
  );
END;
`;

const STATUS_TRACKING_MIGRATION = `
ALTER TABLE articles ADD COLUMN carregado_at TEXT;
ALTER TABLE articles ADD COLUMN usado_at TEXT;
ALTER TABLE articles ADD COLUMN descartado_at TEXT;

CREATE TABLE IF NOT EXISTS article_status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  entry_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('carregado', 'usado', 'descartado')),
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_status_events_date ON article_status_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_status_events_type ON article_status_events(event_type, occurred_at);
`;

const STATUS_EVENTS_BACKFILL = `
UPDATE articles SET usado_at = updated_at WHERE usado = 1 AND usado_at IS NULL;
UPDATE articles SET descartado_at = updated_at WHERE descartado = 1 AND descartado_at IS NULL;
UPDATE articles SET carregado_at = updated_at
WHERE trim(location) != '' AND carregado_at IS NULL;

INSERT INTO article_status_events (group_id, entry_key, event_type, occurred_at)
SELECT a.group_id, a.entry_key, 'usado', a.usado_at
FROM articles a
WHERE a.usado = 1 AND a.usado_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM article_status_events e
    WHERE e.group_id = a.group_id AND e.entry_key = a.entry_key AND e.event_type = 'usado'
  );

INSERT INTO article_status_events (group_id, entry_key, event_type, occurred_at)
SELECT a.group_id, a.entry_key, 'descartado', a.descartado_at
FROM articles a
WHERE a.descartado = 1 AND a.descartado_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM article_status_events e
    WHERE e.group_id = a.group_id AND e.entry_key = a.entry_key AND e.event_type = 'descartado'
  );

INSERT INTO article_status_events (group_id, entry_key, event_type, occurred_at)
SELECT a.group_id, a.entry_key, 'carregado', a.carregado_at
FROM articles a
WHERE a.carregado_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM article_status_events e
    WHERE e.group_id = a.group_id AND e.entry_key = a.entry_key AND e.event_type = 'carregado'
  );
`;

function runMigrationStatements(db: Database.Database, sql: string): void {
  for (const statement of sql.split(';')) {
    const trimmed = statement.trim();
    if (!trimmed) continue;
    try {
      db.exec(trimmed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('duplicate column name')) {
        throw error;
      }
    }
  }
}

export function openDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  try {
    db.exec(UPDATED_AT_MIGRATION);
  } catch {
    // coluna já existe
  }
  try {
    db.exec(UPDATED_AT_MIGRATION_ARTICLES);
  } catch {
    // coluna já existe
  }
  runMigrationStatements(db, STATUS_TRACKING_MIGRATION);
  runMigrationStatements(db, STATUS_EVENTS_BACKFILL);
  db.exec(FTS_TRIGGER_MIGRATION);
  return db;
}

export function rebuildFts(db: Database.Database): void {
  db.exec("INSERT INTO articles_fts(articles_fts) VALUES('rebuild')");
}
