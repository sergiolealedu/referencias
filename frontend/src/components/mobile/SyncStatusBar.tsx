import { useEffect, useState } from 'react';

import { syncEngine } from '../../sync/SyncEngine';
import type { SyncState } from '../../sync/types';

export function SyncStatusBar() {
  const [state, setState] = useState<SyncState>(syncEngine.getState());

  useEffect(() => {
    return syncEngine.subscribe(setState);
  }, []);

  const statusLabel = state.isSyncing
    ? 'Sincronizando…'
    : !state.isOnline
      ? 'Offline'
      : state.pendingCount > 0
        ? `${state.pendingCount} pendente(s)`
        : state.lastSyncAt
          ? 'Sincronizado'
          : 'Aguardando sync';

  const statusClass = !state.isOnline
    ? 'offline'
    : state.pendingCount > 0
      ? 'pending'
      : state.lastError
        ? 'error'
        : 'ok';

  return (
    <div className={`sync-status-bar ${statusClass}`}>
      <span className="sync-dot" />
      <span>{statusLabel}</span>
      {state.lastError && <span className="sync-error-hint">{state.lastError}</span>}
      {state.lastConflicts.length > 0 && (
        <span className="sync-conflicts">{state.lastConflicts.length} conflito(s)</span>
      )}
    </div>
  );
}
