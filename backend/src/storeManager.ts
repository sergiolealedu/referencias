import { loadAppSettings } from './appSettings.js';
import { backupSqliteDatabase } from './store/sqliteBackup.js';
import { SqliteStore } from './store/sqliteStore.js';
import { getRegistry } from './registry/registryStore.js';
import { loadWorkspaces, getActiveWorkspace } from './workspaceManager.js';
import { logBootstrapTokenIfNeeded } from './bootstrapAccess.js';

await loadAppSettings();
await loadWorkspaces();
getRegistry();
logBootstrapTokenIfNeeded();

const storeCache = new Map<string, SqliteStore>();

export function getStore(sqliteDbPath: string): SqliteStore {
  let store = storeCache.get(sqliteDbPath);
  if (!store) {
    store = new SqliteStore(sqliteDbPath);
    storeCache.set(sqliteDbPath, store);
  }
  return store;
}

export function invalidateStore(sqliteDbPath: string): void {
  const store = storeCache.get(sqliteDbPath);
  if (store && 'close' in store && typeof store.close === 'function') {
    store.close();
  }
  storeCache.delete(sqliteDbPath);
}

const defaultWorkspace = getActiveWorkspace();
const backupPath = await backupSqliteDatabase(defaultWorkspace.sqliteDbPath);
if (backupPath) {
  console.log(`Backup SQLite criado: ${backupPath}`);
}

/** @deprecated Use getStore(path) com o workspace do dispositivo. */
export const storeManager = {
  get store() {
    return getStore(getActiveWorkspace().sqliteDbPath);
  },
  replaceStore(_nextSqliteDbPath: string) {
    // Mantido por compatibilidade; cache é por caminho.
  },
};
