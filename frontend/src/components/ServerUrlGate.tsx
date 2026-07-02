import { useEffect, useState } from 'react';

import { checkServerHealth, getServerUrl, setServerUrl } from '../platform/serverUrl';

interface ServerUrlGateProps {
  children: React.ReactNode;
}

export function ServerUrlGate({ children }: ServerUrlGateProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await getServerUrl();
      setUrl(saved);
      setLoading(false);
      try {
        await checkServerHealth();
        setReady(true);
      } catch {
        setReady(false);
      }
    })();
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    try {
      await setServerUrl(url);
      const health = await checkServerHealth();
      setReady(true);
      if (health.workspaceName) {
        setError(null);
      }
    } catch (err) {
      setError((err as Error).message);
      setReady(false);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="device-onboarding">
        <div className="device-onboarding-card">
          <p>Carregando…</p>
        </div>
      </div>
    );
  }

  if (ready) {
    return <>{children}</>;
  }

  return (
    <div className="device-onboarding">
      <div className="device-onboarding-card mobile-server-config">
        <h2>Conectar ao servidor</h2>
        <p className="hint">
          Informe o endereço do backend rodando no seu PC (ex.: http://192.168.0.10:3001).
        </p>
        <label className="field">
          <span>URL do servidor</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://192.168.0.100:3001"
            autoComplete="off"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button
          type="button"
          className="primary"
          disabled={testing || !url.trim()}
          onClick={() => void handleTest()}
        >
          {testing ? 'Testando…' : 'Testar e continuar'}
        </button>
      </div>
    </div>
  );
}
