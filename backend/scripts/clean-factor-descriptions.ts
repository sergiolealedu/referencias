/**
 * Tira o resumo em português das descrições de fator já gravadas.
 *
 *   npx tsx scripts/clean-factor-descriptions.ts                    # só relata
 *   npx tsx scripts/clean-factor-descriptions.ts --apply             # grava
 *   npx tsx scripts/clean-factor-descriptions.ts --db /caminho/x.db  # alvo explícito
 *
 * Sem --apply nada é escrito: a reescrita é heurística sobre texto de pesquisa,
 * e o diff deve ser conferido antes. Com --apply o banco é copiado para
 * data/backups antes da gravação.
 *
 * Em servidor com mais de um workspace, passe --db: sem ele o alvo é o
 * workspace ativo no registry, que pode não ser o que você quer limpar.
 */
import { resolve } from 'node:path';

import '../src/config.js';
import { getActiveWorkspace, loadWorkspaces } from '../src/workspaceManager.js';
import { backupSqliteDatabase } from '../src/store/sqliteBackup.js';
import { SqliteStore } from '../src/store/sqliteStore.js';

const apply = process.argv.includes('--apply');
const dbFlag = process.argv.indexOf('--db');

let dbPath: string;
if (dbFlag >= 0 && process.argv[dbFlag + 1]) {
  dbPath = resolve(process.argv[dbFlag + 1]);
} else {
  await loadWorkspaces();
  dbPath = getActiveWorkspace().sqliteDbPath;
}

console.log(`Banco: ${dbPath}\n`);

if (apply) {
  const backup = await backupSqliteDatabase(dbPath);
  console.log(backup ? `Backup: ${backup}\n` : 'Banco não encontrado para backup.\n');
}

const store = new SqliteStore(dbPath);
const r = await store.cleanFactorDescriptions(apply);

console.log(`Ocorrências de fator: ${r.ocorrencias}`);
console.log(`A reescrever: ${r.reescritas.length} · A revisar à mão: ${r.revisar.length}\n`);

for (const item of r.reescritas) {
  console.log(`[${item.key}] ${item.label}`);
  console.log(`  - ${item.antes}`);
  console.log(`  + ${item.depois}\n`);
}

if (r.revisar.length > 0) {
  console.log('--- Sem reescrita automática (a referência é a única pista do trecho) ---');
  for (const item of r.revisar) {
    console.log(`[${item.key}] ${item.label} — ${item.motivo}`);
    console.log(`  ${item.atual}\n`);
  }
}

console.log(
  r.gravado
    ? `Gravado: ${r.reescritas.length} descrição(ões) atualizada(s).`
    : apply
      ? 'Nada a gravar.'
      : 'Nada gravado (rode com --apply para aplicar).',
);
store.close();
