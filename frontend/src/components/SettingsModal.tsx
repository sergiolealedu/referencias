import { useEffect, useState } from 'react';

import { useSettings, useUpdateSettings } from '../hooks/useApi';

interface SettingsModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export function SettingsModal({ onClose, onSaved }: SettingsModalProps) {
  const { data: settings, isLoading, error } = useSettings();
  const updateSettings = useUpdateSettings();
  const [sqliteDbPath, setSqliteDbPath] = useState('');
  const [allowedPdfRoots, setAllowedPdfRoots] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setSqliteDbPath(settings.sqliteDbPath);
    setAllowedPdfRoots(settings.allowedPdfRoots.join('; '));
    setSaveError(null);
  }, [settings]);

  const handleSave = async () => {
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
      onSaved();
      onClose();
    } catch (err) {
      setSaveError((err as Error).message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Configuração</h3>
          <button type="button" className="form-close" onClick={onClose} title="Fechar">
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-subtitle">
            Alterações afetam o workspace ativo (
            <strong>{settings?.activeWorkspaceName ?? '…'}</strong>) e são salvas em{' '}
            <code>data/workspaces.json</code>.
          </p>

          {isLoading && <p>Carregando configuração...</p>}
          {error && <p className="error">Erro: {(error as Error).message}</p>}

          {!isLoading && !error && (
            <>
              <label>
                Caminho do banco SQLite
                <input
                  value={sqliteDbPath}
                  onChange={(e) => setSqliteDbPath(e.target.value)}
                  placeholder="C:\dados\referencias.db"
                />
              </label>

              <label>
                Pastas permitidas para PDF (separadas por ;)
                <input
                  value={allowedPdfRoots}
                  onChange={(e) => setAllowedPdfRoots(e.target.value)}
                  placeholder="G:\Meu Drive\doutorado"
                />
              </label>

              <p className="hint">
                Se deixar as pastas de PDF em branco, será usada a pasta pai do arquivo .db.
              </p>
            </>
          )}

          {saveError && <p className="error">{saveError}</p>}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleSave}
            disabled={updateSettings.isPending || isLoading}
          >
            {updateSettings.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
