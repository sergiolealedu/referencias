import { useEffect, useState } from 'react';

import {
  useActivateWorkspace,
  useCreateJoinToken,
  useCreateWorkspace,
  useJoinWorkspace,
  useLeaveWorkspace,
  useWorkspaces,
} from '../hooks/useApi';
import type { JoinTokenInfo } from '../types/device';
import type { WorkspaceSummary } from '../types/workspace';

interface WorkspaceModalProps {
  onClose: () => void;
  onWorkspaceChanged: () => void;
}

type Panel = 'list' | 'create' | 'join' | 'invite';

export function WorkspaceModal({ onClose, onWorkspaceChanged }: WorkspaceModalProps) {
  const { data: workspaces = [], isLoading, error } = useWorkspaces();
  const activateWorkspace = useActivateWorkspace();
  const createWorkspace = useCreateWorkspace();
  const leaveWorkspace = useLeaveWorkspace();
  const joinWorkspace = useJoinWorkspace();
  const createJoinToken = useCreateJoinToken();

  const [panel, setPanel] = useState<Panel>('list');
  const [newName, setNewName] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [inviteWorkspace, setInviteWorkspace] = useState<WorkspaceSummary | null>(null);
  const [generatedToken, setGeneratedToken] = useState<JoinTokenInfo | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActionError(null);
    setGeneratedToken(null);
    setCopied(false);
  }, [panel, workspaces]);

  const handleActivate = async (workspace: WorkspaceSummary) => {
    if (workspace.isActive) return;
    setActionError(null);
    try {
      await activateWorkspace.mutateAsync(workspace.id);
      onWorkspaceChanged();
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
      setPanel('list');
      onWorkspaceChanged();
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
      setPanel('list');
      onWorkspaceChanged();
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
      onWorkspaceChanged();
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
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleCopyToken = async () => {
    if (!generatedToken) return;
    try {
      await navigator.clipboard.writeText(generatedToken.token);
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
    createJoinToken.isPending;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal workspace-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Workspaces</h3>
          <button type="button" className="form-close" onClick={onClose} title="Fechar">
            ×
          </button>
        </div>

        <div className="modal-body">
          {panel === 'list' && (
            <>
              <p className="modal-subtitle">
                Cada dispositivo autenticado pode participar de vários workspaces e trocar entre
                eles.
              </p>

              {isLoading && <p>Carregando workspaces...</p>}
              {error && <p className="error">Erro: {(error as Error).message}</p>}

              {!isLoading && !error && (
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
                            onClick={() => handleActivate(workspace)}
                            disabled={isBusy}
                          >
                            Ativar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleGenerateToken(workspace)}
                          disabled={isBusy}
                          title="Gerar token para outro dispositivo"
                        >
                          Convidar
                        </button>
                        {workspaces.length > 1 && (
                          <button
                            type="button"
                            className="danger"
                            onClick={() => void handleLeave(workspace)}
                            disabled={isBusy}
                            title="Sair deste workspace neste dispositivo"
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
                <button type="button" onClick={() => setPanel('create')} disabled={isBusy}>
                  + Novo workspace
                </button>
                <button type="button" onClick={() => setPanel('join')} disabled={isBusy}>
                  Entrar com token
                </button>
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
                Um banco SQLite será criado automaticamente em{' '}
                <code>data/workspaces/&lt;nome&gt;/referencias.db</code>.
              </p>
              <div className="workspace-create-actions">
                <button type="button" onClick={() => setPanel('list')}>
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
                Cole o token gerado por alguém que já tenha acesso ao workspace.
              </p>
              <div className="workspace-create-actions">
                <button type="button" onClick={() => setPanel('list')}>
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
                    <button type="button" onClick={() => void handleCopyToken()}>
                      {copied ? 'Copiado!' : 'Copiar token'}
                    </button>
                  </div>
                  <p className="hint">
                    Envie este token para quem precisa acessar o workspace em um novo dispositivo.
                  </p>
                </>
              )}
              <div className="workspace-create-actions">
                <button type="button" onClick={() => setPanel('list')}>
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
