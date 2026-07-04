import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { referenciasDataSchema } from '../src/schemas/referencias.js';
import { articleToRowValues } from '../src/store/articleMapper.js';
import { openDatabase, rebuildFts } from '../src/store/sqliteDb.js';

function parseArgs(): { source: string; target: string } {
  const args = process.argv.slice(2);
  let source = process.env.JSON_DB_PATH?.trim() ?? '';
  let target = process.env.SQLITE_DB_PATH?.trim() ?? '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) {
      source = args[++i];
    } else if (args[i] === '--target' && args[i + 1]) {
      target = args[++i];
    }
  }

  if (!source || !target) {
    console.error(
      'Uso: npm run migrate:json -- --source <referencias.json> --target <referencias.db>',
    );
    process.exit(1);
  }

  return { source: resolve(source), target: resolve(target) };
}

function migrateGroupDefaults(groups: Array<Record<string, unknown>>): number {
  let updated = 0;
  for (const group of groups) {
    let changed = false;
    if (typeof group.versao !== 'string' || !group.versao.trim()) {
      group.versao = 'v1';
      changed = true;
    }
    if (group.mecanismo === undefined) {
      group.mecanismo = '';
      changed = true;
    }
    if (group.stringBusca === undefined) {
      group.stringBusca = '';
      changed = true;
    }
    if (changed) updated += 1;
  }
  return updated;
}

const { source, target } = parseArgs();
const started = Date.now();

console.log(`Origem:  ${source}`);
console.log(`Destino: ${target}`);

const raw = await readFile(source, 'utf-8');
const parsed = JSON.parse(raw) as unknown;
const migratedGroups = migrateGroupDefaults(
  (parsed as { groups?: Array<Record<string, unknown>> }).groups ?? [],
);
const data = referenciasDataSchema.parse(parsed);

const db = openDatabase(target);

const insertGroup = db.prepare(
  `INSERT INTO groups (id, title, versao, mecanismo, string_busca, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
);

const insertArticle = db.prepare(
  `INSERT INTO articles (
    group_id, entry_key, entry_type, fields_json, status, source, location,
    caminho, notes, tags_json, factors_json, descartado, usado,
    duplicate_group_id, duplicate_key
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

let articleCount = 0;
let duplicateRefs = 0;

const tx = db.transaction(() => {
  db.exec('DELETE FROM articles');
  db.exec('DELETE FROM groups');

  for (const group of data.groups) {
    insertGroup.run(
      group.id,
      group.title,
      group.versao,
      group.mecanismo,
      group.stringBusca,
      group.createdAt,
    );

    for (const article of group.articles) {
      const values = articleToRowValues(group.id, article);
      insertArticle.run(
        values.group_id,
        values.entry_key,
        values.entry_type,
        values.fields_json,
        values.status,
        values.source,
        values.location,
        values.caminho,
        values.notes,
        values.tags_json,
        values.factors_json ?? '[]',
        values.descartado,
        values.usado,
        values.duplicate_group_id,
        values.duplicate_key,
      );
      articleCount += 1;
      if (article.duplicateOf) duplicateRefs += 1;
    }
  }
});

tx();
rebuildFts(db);

const dbGroupCount = (
  db.prepare('SELECT COUNT(*) AS c FROM groups').get() as { c: number }
).c;
const dbArticleCount = (
  db.prepare('SELECT COUNT(*) AS c FROM articles').get() as { c: number }
).c;

db.close();

const elapsed = ((Date.now() - started) / 1000).toFixed(1);

console.log('');
console.log('Migração concluída:');
console.log(`  Grupos no JSON:     ${data.groups.length}`);
console.log(`  Grupos no SQLite:   ${dbGroupCount}`);
console.log(`  Artigos no JSON:    ${articleCount}`);
console.log(`  Artigos no SQLite:  ${dbArticleCount}`);
console.log(`  Referências dup.:   ${duplicateRefs}`);
console.log(`  Grupos migrados:    ${migratedGroups}`);
console.log(`  Tempo:              ${elapsed}s`);

if (dbGroupCount !== data.groups.length || dbArticleCount !== articleCount) {
  console.error('ERRO: contagens não conferem.');
  process.exit(1);
}
