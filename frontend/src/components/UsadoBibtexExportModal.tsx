import { useEffect, useMemo, useState } from 'react';

import { useUsadoArticles } from '../hooks/useApi';
import type { SearchResult } from '../types/referencias';
import {
  articlesToBibtex,
  copyBibtexBulkToClipboard,
  downloadBibtexBulk,
  usadoItemKey,
} from '../utils/bibtexExport';

interface UsadoBibtexExportModalProps {
  onClose: () => void;
}

export function UsadoBibtexExportModal({ onClose }: UsadoBibtexExportModalProps) {
  const { data: usadoItems = [], isLoading, error } = useUsadoArticles();
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setCheckedKeys(new Set(usadoItems.map(usadoItemKey)));
  }, [usadoItems]);

  const selectedItems = useMemo(
    () => usadoItems.filter((item) => checkedKeys.has(usadoItemKey(item))),
    [usadoItems, checkedKeys],
  );

  const selectedArticles = useMemo(
    () => selectedItems.map((item) => item.article),
    [selectedItems],
  );

  const bibtexPreview = useMemo(() => {
    if (selectedArticles.length === 0) return '';
    try {
      return articlesToBibtex(selectedArticles);
    } catch {
      return '';
    }
  }, [selectedArticles]);

  const allSelected =
    usadoItems.length > 0 && usadoItems.every((item) => checkedKeys.has(usadoItemKey(item)));

  const someSelected =
    !allSelected && usadoItems.some((item) => checkedKeys.has(usadoItemKey(item)));

  const toggleItem = (item: SearchResult) => {
    const key = usadoItemKey(item);
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setMessage(null);
  };

  const toggleAll = () => {
    if (allSelected) {
      setCheckedKeys(new Set());
    } else {
      setCheckedKeys(new Set(usadoItems.map(usadoItemKey)));
    }
    setMessage(null);
  };

  const handleExport = async (mode: 'copy' | 'download') => {
    setMessage(null);
    try {
      if (selectedArticles.length === 0) {
        setMessage('Selecione ao menos uma entrada para exportar.');
        return;
      }
      if (mode === 'copy') {
        await copyBibtexBulkToClipboard(selectedArticles);
        setMessage(`${selectedArticles.length} entrada(s) copiada(s).`);
      } else {
        downloadBibtexBulk(selectedArticles, 'referencias-usados.bib');
        setMessage(`${selectedArticles.length} entrada(s) exportada(s).`);
      }
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal usado-export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Exportar BibTeX — usados</h3>
          <button type="button" className="form-close" onClick={onClose} title="Fechar">
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-subtitle">
            Todos os grupos — ordem por id (chave BibTeX)
          </p>

          {isLoading && <p className="hint">Carregando entradas usadas...</p>}

          {error && <p className="error">Erro: {(error as Error).message}</p>}

          {!isLoading && !error && usadoItems.length === 0 && (
            <p className="error">Nenhuma entrada marcada como usada.</p>
          )}

          {!isLoading && !error && usadoItems.length > 0 && (
            <>
              <div className="export-selection-header">
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                  />
                  Selecionar todas ({checkedKeys.size}/{usadoItems.length})
                </label>
              </div>

              <ul className="export-selection-list">
                {usadoItems.map((item) => {
                  const key = usadoItemKey(item);
                  return (
                    <li key={key}>
                      <label className="export-selection-item">
                        <input
                          type="checkbox"
                          checked={checkedKeys.has(key)}
                          onChange={() => toggleItem(item)}
                        />
                        <code className="export-selection-id">{item.article.entry.key}</code>
                        <span className="export-selection-group">{item.groupTitle}</span>
                        <span className="export-selection-title">
                          {item.article.entry.fields.title || '—'}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <div className="bibtex-preview export-preview">
                <div className="bibtex-preview-header">
                  <h4>Pré-visualização BibTeX</h4>
                  <span className="hint">
                    {selectedArticles.length} entrada(s) selecionada(s)
                  </span>
                </div>
                <pre>{bibtexPreview || '—'}</pre>
              </div>
            </>
          )}

          {message && <p className="export-hint">{message}</p>}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => handleExport('copy')}
            disabled={isLoading || usadoItems.length === 0 || selectedArticles.length === 0}
          >
            Copiar BibTeX
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => handleExport('download')}
            disabled={isLoading || usadoItems.length === 0 || selectedArticles.length === 0}
          >
            Baixar .bib
          </button>
        </div>
      </div>
    </div>
  );
}
