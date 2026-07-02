import '../src/config.js';
import { storeManager } from '../src/storeManager.js';

const result = await storeManager.store.cleanAuthorFields();
console.log(`Autores atualizados: ${result.updated}`);
