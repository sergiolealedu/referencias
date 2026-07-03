import { useMemo, useState } from 'react';

import { useGroups, useImportGroup } from '../hooks/useApi';
import type { GroupExport, GroupImportResult } from '../types/referencias';
import { parseGroupExportFile } from '../utils/groupExport';

interface GroupImportModalProps {
  defaultTargetGroupId?: number | null;
  onClose: () => void;
  onImported?: (result: GroupImportResult) => void;
}

export function GroupImportModal({
  defaultTargetGroupId = null,
  onClose,
  onImported,
}: GroupImportModalProps) {
  const { data: groups = [] } = useGroups();
  const importGroup = useImportGroup();

  const [mode, setMode] = useState<'new' | 'merge'>(
    defaultTargetGroupId !== null ? 'merge' : 'new',
  );
  const [targetGroupId, setTargetGroupId] = useState<number | null>(defaultTargetGroupId);
  const [title, setTitle] = useState('');
  const [onConflict, setOnConflict] = useState<'skip' | 'replace'>('skip');
  const [preview, setPreview] = useState<GroupExport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GroupImportResult | null>(null);

  const effectiveTitle = useMemo(() => {
    if (title.trim()) return title.trim();
    if (preview) return preview.group.title;
    return '';
  }, [title, preview]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setResult(null);
    const file = event.target.files?.[0];
    if (!file) {
      setPreview(null);
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseGroupExportFile(text);
      setPreview(parsed);
      if (!title.trim()) {
        setTitle(parsed.group.title);
      }
    } catch (err) {
      setPreview(null);
      setError((err as Error).message);
    } finally {
      event.target.value = '';
    }
  };

  const handleImport = async () => {
    setError(null);
    if (!preview) {
      setError('Selecione um arquivo JSON exportado de outro servidor.');
      return;
    }
    if (!effectiveTitle) {
      setError('Informe um título para o grupo.');
      return;
    }
    if (mode === 'merge' && targetGroupId === null) {
      setError('Selecione o grupo de destino para mesclar.');
      return;
    }

    try {
      const importResult = await importGroup.mutateAsync({
        payload: preview,
        options: {
          ...(mode === 'merge' && targetGroupId !== null
            ? { targetGroupId, onConflict }
            : {}),
          title: effectiveTitle,
        },
      });
      setResult(importResult);
      onImported?.(importResult);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal group-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Importar grupo</h3>
          <button type="button" className="form-close" onClick={onClose} title="Fechar">
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-subtitle">
            Carregue um arquivo <code>.json</code> exportado de outro servidor para restaurar
            metadados e todos os artigos do grupo.
          </p>

          <label>
            Arquivo de exportação
            <input type="file" accept=".json,application/json" onChange={handleFileChange} />
          </label>

          {preview && (
            <div className="import-preview">
              <p>
                <strong>{preview.group.title}</strong> — {preview.articles.length} artigo(s)
              </p>
              <p className="hint">
                Origem: {preview.group.mecanismo || '—'} · {preview.group.versao} · exportado em{' '}
                {new Date(preview.exportedAt).toLocaleString('pt-BR')}
              </p>
            </div>
          )}

          <label>
            Título do grupo
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título no servidor de destino"
            />
          </label>

          <fieldset className="import-mode">
            <legend>Destino</legend>
            <label className="checkbox-inline">
              <input
                type="radio"
                name="import-mode"
                checked={mode === 'new'}
                onChange={() => {
                  setMode('new');
                  setTargetGroupId(null);
                }}
              />
              Criar novo grupo
            </label>
            <label className="checkbox-inline">
              <input
                type="radio"
                name="import-mode"
                checked={mode === 'merge'}
                onChange={() => {
                  setMode('merge');
                  setTargetGroupId(defaultTargetGroupId);
                }}
              />
              Mesclar em grupo existente
            </label>
          </fieldset>

          {mode === 'merge' && (
            <>
              <label>
                Grupo de destino
                <select
                  value={targetGroupId ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTargetGroupId(value ? Number(value) : null);
                  }}
                >
                  <option value="">Selecione um grupo</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.title} ({group.articleCount}) — {group.versao}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Se a chave já existir
                <select
                  value={onConflict}
                  onChange={(e) => setOnConflict(e.target.value as 'skip' | 'replace')}
                >
                  <option value="skip">Ignorar artigo importado</option>
                  <option value="replace">Substituir artigo existente</option>
                </select>
              </label>
            </>
          )}

          {error && <pre className="error">{error}</pre>}

          {result && (
            <div className="import-result">
              <p>
                Grupo <strong>{result.groupTitle}</strong> (id {result.groupId}):{' '}
                <strong>{result.imported}</strong> importado(s),{' '}
                <strong>{result.replaced}</strong> substituído(s),{' '}
                <strong>{result.skipped}</strong> ignorado(s).
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            {result ? 'Fechar' : 'Cancelar'}
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleImport}
            disabled={importGroup.isPending || !preview}
          >
            {importGroup.isPending ? 'Importando…' : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
