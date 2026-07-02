import '../src/config.js';
import { storeManager } from '../src/storeManager.js';

const versao = process.argv.find((arg) => arg.startsWith('--versao='))?.split('=')[1] ?? 'v2';

const result = storeManager.store.markCrossGroupDuplicates(versao);
console.log(`Duplicatas em grupos ${versao}:`);
console.log(`  Analisados: ${result.scanned}`);
console.log(`  Marcados como repetidos: ${result.marked}`);
console.log(`  Desmarcados: ${result.cleared}`);
console.log(`  Sem alteração: ${result.unchanged}`);
