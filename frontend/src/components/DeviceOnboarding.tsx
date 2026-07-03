import { useState } from 'react';

import {
  useAccessSetup,
  useCreateWorkspace,
  useJoinWorkspace,
} from '../hooks/useApi';
import { showGlobalSettings } from '../utils/platform';

interface DeviceOnboardingProps {
  onComplete: () => void;
}

type OnboardingMode = 'choose' | 'create' | 'join';

export function DeviceOnboarding({ onComplete }: DeviceOnboardingProps) {
  const { data: accessSetup, isLoading: setupLoading } = useAccessSetup();
  const createWorkspace = useCreateWorkspace();
  const joinWorkspace = useJoinWorkspace();

  const [mode, setMode] = useState<OnboardingMode>('choose');
  const [workspaceName, setWorkspaceName] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleBootstrapJoin = async () => {
    if (!accessSetup?.bootstrapToken) return;
    setError(null);
    try {
      await joinWorkspace.mutateAsync(accessSetup.bootstrapToken);
      onComplete();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCreate = async () => {
    if (!workspaceName.trim()) {
      setError('Informe o nome do workspace.');
      return;
    }
    setError(null);
    try {
      await createWorkspace.mutateAsync({ name: workspaceName.trim() });
      onComplete();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleJoin = async () => {
    if (!joinToken.trim()) {
      setError('Informe o token de acesso.');
      return;
    }
    setError(null);
    try {
      await joinWorkspace.mutateAsync(joinToken.trim());
      onComplete();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCopyBootstrap = async () => {
    if (!accessSetup?.bootstrapToken) return;
    try {
      await navigator.clipboard.writeText(accessSetup.bootstrapToken);
      setCopied(true);
    } catch {
      setError('Não foi possível copiar o token.');
    }
  };

  const isBusy = createWorkspace.isPending || joinWorkspace.isPending;
  const showBootstrap =
    accessSetup?.bootstrapToken && accessSetup.bootstrapWorkspaceName;

  return (
    <div className="device-onboarding">
      <div className="device-onboarding-card">
        <h1>Referências — Doutorado</h1>

        {setupLoading && <p>Verificando acesso ao servidor…</p>}

        {!setupLoading && mode === 'choose' && (
          <>
            {showBootstrap ? (
              <div className="device-onboarding-bootstrap">
                <p className="device-onboarding-lead">
                  Este servidor foi recém-instalado. Você pode obter acesso ao workspace{' '}
                  <strong>{accessSetup.bootstrapWorkspaceName}</strong>, entrar com outro token
                  ou criar um workspace novo.
                  {showGlobalSettings() && (
                    <> O primeiro dispositivo com acesso torna-se <strong>administrador</strong>.</>
                  )}
                </p>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void handleBootstrapJoin()}
                  disabled={isBusy}
                >
                  {joinWorkspace.isPending ? 'Conectando…' : 'Obter acesso inicial'}
                </button>
                <div className="workspace-token-box">
                  <code>{accessSetup.bootstrapToken}</code>
                </div>
                <button type="button" onClick={() => void handleCopyBootstrap()}>
                  {copied ? 'Token copiado!' : 'Copiar token para outro dispositivo'}
                </button>
                <p className="hint">
                  O token também aparece nos logs do servidor ao iniciar a API.
                </p>
              </div>
            ) : (
              <p className="device-onboarding-lead">
                Este dispositivo ainda não tem acesso a nenhum workspace. Crie um novo ou entre
                com um token concedido por quem já tem acesso.
              </p>
            )}

            <div className="device-onboarding-actions">
              <button type="button" className="primary" onClick={() => setMode('create')}>
                Criar workspace
              </button>
              <button type="button" onClick={() => setMode('join')}>
                Entrar com token
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <div className="device-onboarding-form">
            <label>
              Nome do workspace
              <input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Ex.: Tese do Sergio"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate();
                }}
              />
            </label>
            {showGlobalSettings() ? (
              <p className="hint">
                Será criado um banco SQLite em{' '}
                <code>data/workspaces/&lt;nome&gt;/referencias.db</code> (dados isolados).
              </p>
            ) : (
              <p className="hint">O workspace será criado no servidor com dados isolados.</p>
            )}
            <div className="device-onboarding-form-actions">
              <button type="button" onClick={() => setMode('choose')}>
                Voltar
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void handleCreate()}
                disabled={isBusy}
              >
                {createWorkspace.isPending ? 'Criando…' : 'Criar'}
              </button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="device-onboarding-form">
            <label>
              Token de acesso
              <input
                value={joinToken}
                onChange={(e) => setJoinToken(e.target.value)}
                placeholder="ws_..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleJoin();
                }}
              />
            </label>
            <p className="hint">
              Peça o token a quem já tenha acesso ao workspace desejado.
            </p>
            <div className="device-onboarding-form-actions">
              <button type="button" onClick={() => setMode('choose')}>
                Voltar
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void handleJoin()}
                disabled={isBusy}
              >
                {joinWorkspace.isPending ? 'Entrando…' : 'Entrar'}
              </button>
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
