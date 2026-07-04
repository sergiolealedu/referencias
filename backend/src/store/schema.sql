PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  versao TEXT NOT NULL DEFAULT 'v2',
  mecanismo TEXT NOT NULL DEFAULT '',
  string_busca TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  entry_key TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'exists',
  source TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  caminho TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  factors_json TEXT NOT NULL DEFAULT '[]',
  descartado INTEGER NOT NULL DEFAULT 0,
  usado INTEGER NOT NULL DEFAULT 0,
  revisao_literatura INTEGER NOT NULL DEFAULT 0,
  duplicate_group_id INTEGER,
  duplicate_key TEXT,
  UNIQUE(group_id, entry_key)
);

CREATE TABLE IF NOT EXISTS factors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_articles_group ON articles(group_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(group_id, status);
CREATE INDEX IF NOT EXISTS idx_articles_usado ON articles(group_id, usado);

CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  entry_key,
  title,
  author,
  journal,
  notes,
  source,
  tags,
  group_id UNINDEXED,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
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

CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
  DELETE FROM articles_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
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
