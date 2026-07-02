import { useState } from 'react';

import { useCreateWorkspace, useJoinWorkspace } from '../hooks/useApi';

interface DeviceOnboardingProps {
  onComplete: () => void;
}

type OnboardingMode = 'choose' | 'create' | 'join';

export function DeviceOnboarding({ onComplete }: DeviceOnboardingProps) {
  const createWorkspace = useCreateWorkspace();
  const joinWorkspace = useJoinWorkspace();

  const [mode, setMode] = useState<OnboardingMode>('choose');
  const [workspaceName, setWorkspaceName] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  const isBusy = createWorkspace.isPending || joinWorkspace.isPending;

  return (
    <div className="device-onboarding">
      <div className="device-onboarding-card">
        <h1>Referências — Doutorado</h1>
        <p className="device-onboarding-lead">
          Este dispositivo ainda não tem acesso a nenhum workspace. Crie um novo ou entre com um
          token gerado por quem já tem acesso.
        </p>

        {mode === 'choose' && (
          <div className="device-onboarding-actions">
            <button type="button" className="primary" onClick={() => setMode('create')}>
              Criar workspace
            </button>
            <button type="button" onClick={() => setMode('join')}>
              Entrar com token
            </button>
          </div>
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
              Peça o token a alguém que já tenha acesso ao workspace desejado.
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
