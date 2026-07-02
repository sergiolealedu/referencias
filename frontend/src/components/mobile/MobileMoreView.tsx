import { useEffect, useState } from 'react';

import { api } from '../../api/dataProvider';
import { checkServerHealth, getServerUrl, setServerUrl } from '../../platform/serverUrl';
import { syncEngine } from '../../sync/SyncEngine';
import { useActiveWorkspace, useJoinWorkspace, useWorkspaces } from '../../hooks/useApi';
import { SyncStatusBar } from './SyncStatusBar';

export function MobileMoreView() {
  const { data: workspaces = [] } = useWorkspaces();
  const { data: activeWorkspace } = useActiveWorkspace();
  const joinWorkspace = useJoinWorkspace();

  const [serverUrl, setServerUrlInput] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const loadServerUrl = async () => {
    const url = await getServerUrl();
    setServerUrlInput(url);
  };

  useEffect(() => {
    void loadServerUrl();
  }, []);

  const handleSaveServer = async () => {
    setError(null);
    setMessage(null);
    try {
      await setServerUrl(serverUrl);
      await checkServerHealth();
      setMessage('Servidor configurado com sucesso.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await syncEngine.sync();
      setMessage('Sincronização concluída.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const handleFullPull = async () => {
    setSyncing(true);
    setError(null);
    try {
      await api.fullPull();
      setMessage('Dados atualizados do servidor.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const handleJoin = async () => {
    if (!joinToken.trim()) return;
    setError(null);
    try {
      await joinWorkspace.mutateAsync(joinToken.trim());
      setJoinToken('');
      setMessage('Workspace adicionado.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="mobile-view mobile-more">
      <h2>Mais</h2>
      <SyncStatusBar />

      <section>
        <h3>Servidor</h3>
        <label className="field">
          <span>URL</span>
          <input
            value={serverUrl}
            onChange={(e) => setServerUrlInput(e.target.value)}
            placeholder="http://192.168.0.100:3001"
          />
        </label>
        <button type="button" onClick={() => void handleSaveServer()}>
          Salvar URL
        </button>
      </section>

      <section>
        <h3>Sincronização</h3>
        <button type="button" className="primary" disabled={syncing} onClick={() => void handleSync()}>
          {syncing ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
        <button type="button" disabled={syncing} onClick={() => void handleFullPull()}>
          Recarregar tudo do servidor
        </button>
      </section>

      <section>
        <h3>Workspace ativo</h3>
        <p>{activeWorkspace?.name ?? '—'}</p>
        <ul className="mobile-workspace-list">
          {workspaces.map((w) => (
            <li key={w.id} className={w.isActive ? 'active' : ''}>
              {w.name}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Entrar em workspace</h3>
        <input
          value={joinToken}
          onChange={(e) => setJoinToken(e.target.value)}
          placeholder="Token de convite"
        />
        <button type="button" onClick={() => void handleJoin()}>
          Entrar
        </button>
      </section>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
