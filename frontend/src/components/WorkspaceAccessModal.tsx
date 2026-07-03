import { useEffect, useState } from 'react';

import {
  useAccessSetup,
  useActivateWorkspace,
  useCreateJoinToken,
  useCreateWorkspace,
  useJoinTokens,
  useJoinWorkspace,
  useLeaveWorkspace,
  useRevokeJoinToken,
  useSettings,
  useUpdateSettings,
  useWorkspaces,
} from '../hooks/useApi';
import type { JoinTokenInfo } from '../types/device';
import type { WorkspaceSummary } from '../types/workspace';

interface WorkspaceAccessModalProps {
  onClose: () => void;
  onChanged: () => void;
  initialTab?: 'access' | 'workspaces';
}

type Panel = 'access' | 'workspaces' | 'create' | 'join' | 'invite';

export function WorkspaceAccessModal({
  onClose,
  onChanged,
  initialTab = 'access',
}: WorkspaceAccessModalProps) {
  const { data: settings, isLoading: settingsLoading, error: settingsError } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: workspaces = [], isLoading: workspacesLoading, error: workspacesError } =
    useWorkspaces();
  const { data: accessSetup } = useAccessSetup();

  const activateWorkspace = useActivateWorkspace();
  const createWorkspace = useCreateWorkspace();
  const leaveWorkspace = useLeaveWorkspace();
  const joinWorkspace = useJoinWorkspace();
  const createJoinToken = useCreateJoinToken();
  const revokeJoinToken = useRevokeJoinToken();

  const activeWorkspace =
    workspaces.find((workspace) => workspace.isActive) ??
    workspaces.find((workspace) => workspace.id === settings?.activeWorkspaceId) ??
    null;

  const { data: activeTokens = [], refetch: refetchTokens } = useJoinTokens(
    activeWorkspace?.id ?? null,
  );

  const [panel, setPanel] = useState<Panel>(initialTab);
  const [sqliteDbPath, setSqliteDbPath] = useState('');
  const [allowedPdfRoots, setAllowedPdfRoots] = useState('');
  const [newName, setNewName] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [inviteWorkspace, setInviteWorkspace] = useState<WorkspaceSummary | null>(null);
  const [generatedToken, setGeneratedToken] = useState<JoinTokenInfo | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setSqliteDbPath(settings.sqliteDbPath);
    setAllowedPdfRoots(settings.allowedPdfRoots.join('; '));
    setSaveError(null);
  }, [settings]);

  useEffect(() => {
    setActionError(null);
    setGeneratedToken(null);
    setCopied(false);
  }, [panel, workspaces]);

  const handleSavePaths = async () => {
    if (!sqliteDbPath.trim()) {
      setSaveError('Informe o caminho do banco SQLite.');
      return;
    }

    const roots = allowedPdfRoots
      .split(';')
      .map((root) => root.trim())
      .filter(Boolean);

    setSaveError(null);
    try {
      await updateSettings.mutateAsync({
        sqliteDbPath: sqliteDbPath.trim(),
        ...(roots.length > 0 ? { allowedPdfRoots: roots } : {}),
      });
      onChanged();
    } catch (err) {
      setSaveError((err as Error).message);
    }
  };

  const handleActivate = async (workspace: WorkspaceSummary) => {
    if (workspace.isActive) return;
    setActionError(null);
    try {
      await activateWorkspace.mutateAsync(workspace.id);
      onChanged();
      onClose();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      setActionError('Informe o nome do workspace.');
      return;
    }
    setActionError(null);
    try {
      await createWorkspace.mutateAsync({ name: newName.trim() });
      setNewName('');
      setPanel('workspaces');
      onChanged();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleJoin = async () => {
    if (!joinToken.trim()) {
      setActionError('Informe o token de acesso.');
      return;
    }
    setActionError(null);
    try {
      await joinWorkspace.mutateAsync(joinToken.trim());
      setJoinToken('');
      setPanel('access');
      onChanged();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleLeave = async (workspace: WorkspaceSummary) => {
    if (
      !window.confirm(
        `Sair do workspace "${workspace.name}"?\n\nVocê poderá voltar com um novo token de acesso.`,
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      await leaveWorkspace.mutateAsync(workspace.id);
      onChanged();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleGenerateToken = async (workspace: WorkspaceSummary) => {
    setInviteWorkspace(workspace);
    setPanel('invite');
    setActionError(null);
    try {
      const token = await createJoinToken.mutateAsync(workspace.id);
      setGeneratedToken(token);
      await refetchTokens();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleRevokeToken = async (token: string) => {
    if (!activeWorkspace) return;
    if (!window.confirm('Revogar este token? Novos dispositivos não poderão usá-lo.')) return;
    setActionError(null);
    try {
      await revokeJoinToken.mutateAsync({ workspaceId: activeWorkspace.id, token });
      await refetchTokens();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setActionError('Não foi possível copiar o token.');
    }
  };

  const isBusy =
    activateWorkspace.isPending ||
    createWorkspace.isPending ||
    leaveWorkspace.isPending ||
    joinWorkspace.isPending ||
    createJoinToken.isPending ||
    updateSettings.isPending ||
    revokeJoinToken.isPending;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal workspace-modal workspace-access-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Acesso ao workspace</h3>
          <button type="button" className="form-close" onClick={onClose} title="Fechar">
            ×
          </button>
        </div>

        {(panel === 'access' || panel === 'workspaces') && (
          <div className="workspace-access-tabs">
            <button
              type="button"
              className={panel === 'access' ? 'active' : ''}
              onClick={() => setPanel('access')}
            >
              Workspace ativo
            </button>
            <button
              type="button"
              className={panel === 'workspaces' ? 'active' : ''}
              onClick={() => setPanel('workspaces')}
            >
              Todos os workspaces
            </button>
          </div>
        )}

        <div className="modal-body">
          {panel === 'access' && (
            <>
              <p className="modal-subtitle">
                Quem tem acesso ao workspace <strong>{activeWorkspace?.name ?? '…'}</strong> pode
                alterar caminhos de dados e gerar tokens para convidar outros dispositivos.
              </p>

              {settingsLoading && <p>Carregando…</p>}
              {settingsError && <p className="error">Erro: {(settingsError as Error).message}</p>}

              {!settingsLoading && !settingsError && (
                <>
                  <label>
                    Caminho do banco SQLite
                    <input
                      value={sqliteDbPath}
                      onChange={(e) => setSqliteDbPath(e.target.value)}
                      placeholder="data/referencias.db"
                    />
                  </label>

                  <label>
                    Pastas permitidas para PDF (separadas por ;)
                    <input
                      value={allowedPdfRoots}
                      onChange={(e) => setAllowedPdfRoots(e.target.value)}
                      placeholder="/var/lib/referencias/pdfs"
                    />
                  </label>

                  <p className="hint">
                    Alterações afetam apenas o workspace ativo e são compartilhadas com todos os
                    dispositivos que têm acesso a ele.
                  </p>

                  <div className="workspace-create-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void handleSavePaths()}
                      disabled={isBusy}
                    >
                      {updateSettings.isPending ? 'Salvando…' : 'Salvar caminhos'}
                    </button>
                  </div>

                  {saveError && <p className="error">{saveError}</p>}

                  <section className="workspace-access-section">
                    <h4>Convidar outro dispositivo</h4>
                    <p className="hint">
                      Gere um token e envie para quem precisa acessar este workspace em outro
                      navegador ou computador.
                    </p>
                    {activeWorkspace && (
                      <button
                        type="button"
                        onClick={() => void handleGenerateToken(activeWorkspace)}
                        disabled={isBusy}
                      >
                        Gerar token de acesso
                      </button>
                    )}

                    {activeTokens.length > 0 && (
                      <ul className="workspace-token-list">
                        {activeTokens.map((tokenInfo) => (
                          <li key={tokenInfo.token} className="workspace-token-item">
                            <code title={tokenInfo.token}>{tokenInfo.token.slice(0, 20)}…</code>
                            <span className="hint">
                              {new Date(tokenInfo.createdAt).toLocaleString('pt-BR')}
                            </span>
                            <div className="workspace-item-actions">
                              <button
                                type="button"
                                onClick={() => void handleCopyToken(tokenInfo.token)}
                              >
                                Copiar
                              </button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() => void handleRevokeToken(tokenInfo.token)}
                                disabled={isBusy}
                              >
                                Revogar
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <div className="workspace-list-actions">
                    <button type="button" onClick={() => setPanel('join')} disabled={isBusy}>
                      Entrar com token
                    </button>
                    {accessSetup?.canCreateWorkspace && (
                      <button type="button" onClick={() => setPanel('create')} disabled={isBusy}>
                        + Novo workspace
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {panel === 'workspaces' && (
            <>
              <p className="modal-subtitle">
                Cada dispositivo pode participar de vários workspaces. Troque o ativo para ver
                grupos e artigos diferentes.
              </p>

              {workspacesLoading && <p>Carregando workspaces…</p>}
              {workspacesError && (
                <p className="error">Erro: {(workspacesError as Error).message}</p>
              )}

              {!workspacesLoading && !workspacesError && (
                <ul className="workspace-list">
                  {workspaces.map((workspace) => (
                    <li
                      key={workspace.id}
                      className={`workspace-item${workspace.isActive ? ' active' : ''}`}
                    >
                      <div className="workspace-item-info">
                        <strong>{workspace.name}</strong>
                        {workspace.isActive && <span className="workspace-badge">Ativo</span>}
                        <span className="workspace-path" title={workspace.sqliteDbPath}>
                          {workspace.sqliteDbPath}
                        </span>
                      </div>
                      <div className="workspace-item-actions">
                        {!workspace.isActive && (
                          <button
                            type="button"
                            onClick={() => void handleActivate(workspace)}
                            disabled={isBusy}
                          >
                            Ativar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleGenerateToken(workspace)}
                          disabled={isBusy}
                        >
                          Convidar
                        </button>
                        {workspaces.length > 1 && (
                          <button
                            type="button"
                            className="danger"
                            onClick={() => void handleLeave(workspace)}
                            disabled={isBusy}
                          >
                            Sair
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="workspace-list-actions">
                <button type="button" onClick={() => setPanel('join')} disabled={isBusy}>
                  Entrar com token
                </button>
                {accessSetup?.canCreateWorkspace && (
                  <button type="button" onClick={() => setPanel('create')} disabled={isBusy}>
                    + Novo workspace
                  </button>
                )}
              </div>
            </>
          )}

          {panel === 'create' && (
            <div className="workspace-create-form">
              <label>
                Nome do novo workspace
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex.: Revisão sistemática 2026"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreate();
                  }}
                />
              </label>
              <p className="hint">
                Um banco SQLite será criado em{' '}
                <code>data/workspaces/&lt;nome&gt;/referencias.db</code>.
              </p>
              <div className="workspace-create-actions">
                <button type="button" onClick={() => setPanel('access')}>
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

          {panel === 'join' && (
            <div className="workspace-create-form">
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
                Cole o token gerado por quem já tem acesso ao workspace.
              </p>
              <div className="workspace-create-actions">
                <button type="button" onClick={() => setPanel('access')}>
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

          {panel === 'invite' && inviteWorkspace && (
            <div className="workspace-invite-panel">
              <p className="modal-subtitle">
                Token de acesso para <strong>{inviteWorkspace.name}</strong>
              </p>
              {createJoinToken.isPending && <p>Gerando token…</p>}
              {generatedToken && (
                <>
                  <div className="workspace-token-box">
                    <code>{generatedToken.token}</code>
                  </div>
                  <div className="workspace-create-actions">
                    <button type="button" onClick={() => void handleCopyToken(generatedToken.token)}>
                      {copied ? 'Copiado!' : 'Copiar token'}
                    </button>
                  </div>
                  <p className="hint">
                    Envie este token para quem precisa acessar o workspace em um novo dispositivo.
                  </p>
                </>
              )}
              <div className="workspace-create-actions">
                <button type="button" onClick={() => setPanel('access')}>
                  Voltar
                </button>
              </div>
            </div>
          )}

          {actionError && <p className="error">{actionError}</p>}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
