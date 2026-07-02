import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

export function openDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  db.exec(FTS_TRIGGER_MIGRATION);
  return db;
}

export function rebuildFts(db: Database.Database): void {
  db.exec("INSERT INTO articles_fts(articles_fts) VALUES('rebuild')");
}
