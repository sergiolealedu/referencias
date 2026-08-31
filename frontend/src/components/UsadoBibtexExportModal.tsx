import { useCallback, useEffect, useMemo, useState } from 'react';

import { useArticlesComFatores } from '../hooks/useApi';
import type { SearchResult } from '../types/referencias';
import {
  articlesToBibtex,
  collectBibtexFieldNames,
  copyBibtexBulkToClipboard,
  downloadBibtexBulk,
  isCoreBibtexField,
  usadoItemKey,
} from '../utils/bibtexExport';
import { usePersistedState } from '../utils/persistedState';

/** Tamanho legível da prévia — o problema que o seletor de campos resolve é volume. */
function formatBytes(chars: number): string {
  if (chars < 1024) return `${chars} B`;
  return `${(chars / 1024).toFixed(chars < 10240 ? 1 : 0)} KB`;
}

interface UsadoBibtexExportModalProps {
  onClose: () => void;
}

export function UsadoBibtexExportModal({ onClose }: UsadoBibtexExportModalProps) {
  const { data: usadoItems = [], isLoading, error } = useArticlesComFatores();
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

  /**
   * Só o que o usuário mexeu. O padrão de cada campo continua vindo de
   * `isCoreBibtexField`, então um campo que apareça no corpus depois desta
   * escolha (base nova, outro exportador) nasce com o padrão certo em vez de
   * herdar um `false` que ninguém pediu.
   */
  const [fieldPrefs, setFieldPrefs] = usePersistedState<Record<string, boolean>>(
    'export.bibtex.campos',
    {},
  );

  // A lista vem de TODOS os itens, não dos selecionados: se encolhesse a cada
  // artigo desmarcado, os campos sumiriam da tela no meio da escolha.
  const allArticles = useMemo(() => usadoItems.map((item) => item.article), [usadoItems]);
  const fieldUsage = useMemo(() => collectBibtexFieldNames(allArticles), [allArticles]);

  // Sob `useCallback` porque entra na lista de dependência do memo abaixo:
  // uma função nova a cada render recalcularia a seleção sempre.
  const isFieldOn = useCallback(
    (name: string) => fieldPrefs[name] ?? isCoreBibtexField(name),
    [fieldPrefs],
  );

  const activeFields = useMemo(
    () => fieldUsage.filter((field) => isFieldOn(field.name)).map((field) => field.name),
    [fieldUsage, isFieldOn],
  );

  const exportOptions = useMemo(() => ({ fields: activeFields }), [activeFields]);

  const bibtexPreview = useMemo(() => {
    if (selectedArticles.length === 0) return '';
    try {
      return articlesToBibtex(selectedArticles, exportOptions);
    } catch {
      return '';
    }
  }, [selectedArticles, exportOptions]);

  const toggleField = (name: string) => {
    setFieldPrefs((prev) => ({ ...prev, [name]: !(prev[name] ?? isCoreBibtexField(name)) }));
    setMessage(null);
  };

  const setAllFields = (on: boolean) => {
    setFieldPrefs(Object.fromEntries(fieldUsage.map((field) => [field.name, on])));
    setMessage(null);
  };

  /** Volta ao padrão: campos do BibTeX marcados, o resto (abstract e afins) fora. */
  const resetFields = () => {
    setFieldPrefs({});
    setMessage(null);
  };

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
      if (activeFields.length === 0) {
        setMessage('Selecione ao menos um campo para exportar.');
        return;
      }
      if (mode === 'copy') {
        await copyBibtexBulkToClipboard(selectedArticles, exportOptions);
        setMessage(`${selectedArticles.length} entrada(s) copiada(s).`);
      } else {
        downloadBibtexBulk(selectedArticles, 'referencias-com-fatores.bib', exportOptions);
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
          <h3>Exportar BibTeX — com fatores</h3>
          <button type="button" className="form-close" onClick={onClose} title="Fechar">
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-subtitle">
            Artigos com fator, de todos os grupos, em ordem alfabética pela chave
            BibTeX — pronto para colar no Overleaf. Os campos que não mudam a
            citação (abstract, keywords, metadados do Scopus) saem desmarcados.
          </p>

          {isLoading && <p className="hint">Carregando artigos com fatores...</p>}

          {error && <p className="error">Erro: {(error as Error).message}</p>}

          {!isLoading && !error && usadoItems.length === 0 && (
            <p className="error">Nenhum artigo com fator associado ainda.</p>
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

              <div className="export-field-picker">
                <div className="export-field-picker-header">
                  <h4>
                    Campos ({activeFields.length}/{fieldUsage.length})
                  </h4>
                  <div className="export-field-actions">
                    <button type="button" onClick={() => setAllFields(true)}>
                      Todos
                    </button>
                    <button type="button" onClick={() => setAllFields(false)}>
                      Nenhum
                    </button>
                    <button type="button" onClick={resetFields}>
                      Padrão
                    </button>
                  </div>
                </div>
                <div className="export-field-list">
                  {fieldUsage.map((field) => {
                    const on = isFieldOn(field.name);
                    return (
                      <label
                        key={field.name}
                        className={`export-field-item${on ? '' : ' export-field-item-off'}`}
                        title={`Presente em ${field.count} de ${usadoItems.length} entradas`}
                      >
                        <input type="checkbox" checked={on} onChange={() => toggleField(field.name)} />
                        <span className="export-field-name">{field.name}</span>
                        <span className="export-field-count">{field.count}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="bibtex-preview export-preview">
                <div className="bibtex-preview-header">
                  <h4>Pré-visualização BibTeX</h4>
                  <span className="hint">
                    {selectedArticles.length} entrada(s) selecionada(s) ·{' '}
                    {formatBytes(bibtexPreview.length)}
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
            disabled={
              isLoading ||
              usadoItems.length === 0 ||
              selectedArticles.length === 0 ||
              activeFields.length === 0
            }
          >
            Copiar BibTeX
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => handleExport('download')}
            disabled={
              isLoading ||
              usadoItems.length === 0 ||
              selectedArticles.length === 0 ||
              activeFields.length === 0
            }
          >
            Baixar .bib
          </button>
        </div>
      </div>
    </div>
  );
}
