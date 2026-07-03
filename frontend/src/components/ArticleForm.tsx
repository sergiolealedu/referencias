import { useEffect, useRef, useState } from 'react';

import { api } from '../api/client';
import {
  useCreateArticle,
  useDeleteArticle,
  useDeleteArticlePdf,
  useUpdateArticle,
  useUploadArticlePdf,
} from '../hooks/useApi';
import { ARTICLE_STATUSES, ENTRY_TYPES, type Article } from '../types/referencias';
import { emptyArticle } from '../types/referencias';
import { articleToBibtex, copyBibtexToClipboard, downloadBibtex } from '../utils/bibtexExport';
import { DomainSelect } from './DomainSelect';
import { FlexibleSelect } from './FlexibleSelect';
import {
  caminhoForStorage,
  extractHowpublishedUrl,
  howpublishedForStorage,
  normalizeArticleForForm,
} from '../utils/bibtexFields';

interface ArticleFormProps {
  groupId: number;
  article: Article | null;
  isNew: boolean;
  onClose: () => void;
  onSaved: (key: string) => void;
}

const FIELD_KEYS = [
  'title',
  'author',
  'editor',
  'journal',
  'booktitle',
  'year',
  'volume',
  'number',
  'pages',
  'abstract',
  'doi',
  'url',
  'howpublished',
  'publisher',
  'isbn',
  'series',
  'address',
  'month',
];

export function ArticleForm({
  groupId,
  article,
  isNew,
  onClose,
  onSaved,
}: ArticleFormProps) {
  const [form, setForm] = useState<Article>(article ?? emptyArticle());
  const [extraFieldKey, setExtraFieldKey] = useState('');
  const [extraFieldValue, setExtraFieldValue] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);
  const [abstractExpanded, setAbstractExpanded] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const createArticle = useCreateArticle(groupId);
  const updateArticle = useUpdateArticle(groupId);
  const deleteArticle = useDeleteArticle(groupId);
  const uploadPdf = useUploadArticlePdf(groupId);
  const deletePdf = useDeleteArticlePdf(groupId);
  const isSaving = createArticle.isPending || updateArticle.isPending;
  const isPdfBusy = uploadPdf.isPending || deletePdf.isPending;

  useEffect(() => {
    setForm(normalizeArticleForForm(article ?? emptyArticle()));
    setSaveError(null);
    setExportMessage(null);
    setPdfMessage(null);
    setAbstractExpanded(false);
  }, [article, isNew]);

  useEffect(() => {
    if (!abstractExpanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAbstractExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [abstractExpanded]);

  const setField = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      entry: {
        ...prev.entry,
        fields: { ...prev.entry.fields, [key]: value },
      },
    }));
  };

  const setRoot = <K extends keyof Article>(key: K, value: Article[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.entry.key.trim()) {
      window.alert('A chave (key) do artigo é obrigatória.');
      return;
    }
    setSaveError(null);
    try {
      const payload = normalizeArticleForForm(form);
      if (isNew) {
        await createArticle.mutateAsync(payload);
      } else if (article) {
        await updateArticle.mutateAsync({ key: article.entry.key, patch: payload });
      }
      onSaved(form.entry.key);
    } catch (error) {
      setSaveError((error as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!article || !window.confirm(`Excluir artigo "${article.entry.key}"?`)) return;
    await deleteArticle.mutateAsync(article.entry.key);
    onClose();
  };

  const addExtraField = () => {
    if (!extraFieldKey.trim()) return;
    setField(extraFieldKey.trim(), extraFieldValue);
    setExtraFieldKey('');
    setExtraFieldValue('');
  };

  const handleMarkFromAbstract = async (field: 'usado' | 'descartado') => {
    const updated: Article = { ...form, [field]: true };
    setForm(updated);
    setAbstractExpanded(false);

    if (!updated.entry.key.trim() || isNew || !article) return;

    setSaveError(null);
    try {
      const payload = normalizeArticleForForm(updated);
      await updateArticle.mutateAsync({ key: article.entry.key, patch: payload });
    } catch (error) {
      setSaveError((error as Error).message);
    }
  };

  const handleExportBibtex = async (mode: 'copy' | 'download') => {
    if (!form.entry.key.trim()) {
      window.alert('A chave (key) do artigo é obrigatória para exportar.');
      return;
    }
    setExportMessage(null);
    try {
      if (mode === 'copy') {
        await copyBibtexToClipboard(form);
        setExportMessage('BibTeX copiado para a área de transferência.');
      } else {
        downloadBibtex(form);
        setExportMessage('Arquivo .bib baixado.');
      }
    } catch (error) {
      setExportMessage((error as Error).message);
    }
  };

  const bibtexPreview = form.entry.key.trim()
    ? articleToBibtex(form)
    : '';

  const extraFields = Object.entries(form.entry.fields).filter(
    ([key]) => !FIELD_KEYS.includes(key),
  );

  const renderEntryField = (key: string) => {
    const value = form.entry.fields[key] ?? '';

    if (key === 'howpublished') {
      return (
        <label key={key}>
          {key}
          <input
            value={value}
            onChange={(e) => setField(key, howpublishedForStorage(e.target.value))}
            placeholder="https://... ou texto livre"
          />
          {extractHowpublishedUrl(value) && (
            <a
              className="field-link"
              href={extractHowpublishedUrl(value)!}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir URL
            </a>
          )}
        </label>
      );
    }

    if (key === 'url') {
      return (
        <label key={key}>
          {key}
          <input value={value} onChange={(e) => setField(key, e.target.value)} placeholder="https://..." />
          {value.trim() && (
            <a
              className="field-link"
              href={value.trim()}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir URL
            </a>
          )}
        </label>
      );
    }

    if (key === 'abstract') {
      return (
        <div key={key} className="abstract-field">
          <div className="field-label-row">
            <span className="field-label">{key}</span>
            <button
              type="button"
              className="secondary-btn abstract-expand-btn"
              onClick={() => setAbstractExpanded(true)}
              title="Abrir em tela cheia para melhor leitura"
            >
              Tela cheia
            </button>
          </div>
          <textarea
            rows={5}
            value={value}
            onChange={(e) => setField(key, e.target.value)}
          />
        </div>
      );
    }

    return (
      <label key={key}>
        {key}
        <input value={value} onChange={(e) => setField(key, e.target.value)} />
      </label>
    );
  };

  return (
    <aside className="article-form">
      <div className="form-header">
        <h3>{isNew ? 'Novo artigo' : 'Editar artigo'}</h3>
        <div className="form-header-actions">
          {form.entry.key.trim() && (
            <>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => handleExportBibtex('copy')}
                title="Copiar BibTeX"
              >
                Exportar BibTeX
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => handleExportBibtex('download')}
                title="Baixar arquivo .bib"
              >
                .bib
              </button>
            </>
          )}
          <button
            type="button"
            className="primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" className="form-close" onClick={onClose} title="Fechar">
            ×
          </button>
        </div>
      </div>

      <div className="form-body">
        <label>
          Chave (key)
          <input
            value={form.entry.key}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                entry: { ...prev.entry, key: e.target.value },
              }))
            }
          />
        </label>

        <label>
          Tipo
          <FlexibleSelect
            value={form.entry.type}
            onChange={(type) =>
              setForm((prev) => ({
                ...prev,
                entry: { ...prev.entry, type },
              }))
            }
            options={ENTRY_TYPES}
          />
        </label>

        {FIELD_KEYS.map((key) => renderEntryField(key))}

        {extraFields.length > 0 && (
          <div className="extra-fields">
            <h4>Campos extras</h4>
            {extraFields.map(([key, value]) => (
              <label key={key}>
                {key}
                <input value={value} onChange={(e) => setField(key, e.target.value)} />
              </label>
            ))}
          </div>
        )}

        <div className="add-field">
          <input
            placeholder="Novo campo"
            value={extraFieldKey}
            onChange={(e) => setExtraFieldKey(e.target.value)}
          />
          <input
            placeholder="Valor"
            value={extraFieldValue}
            onChange={(e) => setExtraFieldValue(e.target.value)}
          />
          <button type="button" onClick={addExtraField}>+</button>
        </div>

        <label>
          Status
          <DomainSelect
            value={form.status}
            onChange={(status) => setRoot('status', status)}
            options={ARTICLE_STATUSES}
          />
        </label>

        <label>
          Source
          <input value={form.source} onChange={(e) => setRoot('source', e.target.value)} />
        </label>

        <label>
          Location
          <input
            value={form.location}
            onChange={(e) => {
              const location = e.target.value;
              setForm((prev) => ({
                ...prev,
                location,
                usado: location.trim() ? true : prev.usado,
                status: location.trim() ? 'exists' : prev.status,
              }));
            }}
          />
        </label>

        <label>
          Caminho do PDF
          <input
            value={form.caminho}
            onChange={(e) => setRoot('caminho', caminhoForStorage(e.target.value))}
            placeholder="Preenchido automaticamente ao enviar um PDF"
          />
        </label>
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            void (async () => {
              if (isNew || !form.entry.key.trim()) {
                setPdfMessage('Salve o artigo antes de enviar o PDF.');
                return;
              }
              if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
                setPdfMessage('Selecione um arquivo PDF.');
                return;
              }
              setPdfMessage(null);
              try {
                const updated = await uploadPdf.mutateAsync({
                  key: form.entry.key,
                  file,
                });
                setForm(normalizeArticleForForm(updated));
                setPdfMessage('PDF enviado com sucesso.');
                onSaved(updated.entry.key);
              } catch (err) {
                setPdfMessage((err as Error).message);
              }
            })();
          }}
        />
        <div className="pdf-actions">
          <button
            type="button"
            className="open-pdf-btn"
            disabled={isNew || isPdfBusy || !form.entry.key.trim()}
            title={isNew ? 'Salve o artigo antes de enviar o PDF' : 'Enviar PDF do artigo'}
            onClick={() => pdfInputRef.current?.click()}
          >
            {uploadPdf.isPending ? 'Enviando…' : 'Enviar PDF'}
          </button>
          <button
            type="button"
            className="open-pdf-btn"
            disabled={!form.caminho.trim() || isPdfBusy}
            onClick={() => {
              if (!form.caminho.trim()) return;
              void (async () => {
                setPdfMessage(null);
                try {
                  await api.openPdf(form.caminho);
                } catch (err) {
                  setPdfMessage((err as Error).message);
                }
              })();
            }}
          >
            Abrir PDF
          </button>
          <button
            type="button"
            className="danger"
            disabled={isNew || !form.caminho.trim() || isPdfBusy}
            onClick={() => {
              if (isNew || !form.entry.key.trim() || !form.caminho.trim()) return;
              if (!window.confirm('Remover o PDF deste artigo?')) return;
              void (async () => {
                setPdfMessage(null);
                try {
                  const updated = await deletePdf.mutateAsync(form.entry.key);
                  setForm(normalizeArticleForForm(updated));
                  setPdfMessage('PDF removido.');
                  onSaved(updated.entry.key);
                } catch (err) {
                  setPdfMessage((err as Error).message);
                }
              })();
            }}
          >
            {deletePdf.isPending ? 'Removendo…' : 'Remover PDF'}
          </button>
        </div>
        {isNew && (
          <p className="hint">Salve o artigo para liberar o envio de PDF.</p>
        )}
        {pdfMessage && (
          <p className={pdfMessage.includes('sucesso') || pdfMessage.includes('removido') ? 'hint' : 'error'}>
            {pdfMessage}
          </p>
        )}

        <label>
          Tags (vírgula)
          <input
            value={form.tags.join(', ')}
            onChange={(e) =>
              setRoot(
                'tags',
                e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>

        <label>
          Notas
          <textarea
            rows={4}
            value={form.notes}
            onChange={(e) => setRoot('notes', e.target.value)}
          />
        </label>

        <div className="checkbox-row">
          <label>
            <input
              type="checkbox"
              checked={form.usado}
              onChange={(e) => setRoot('usado', e.target.checked)}
            />
            Usado
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.descartado}
              onChange={(e) => setRoot('descartado', e.target.checked)}
            />
            Descartado
          </label>
        </div>

        {saveError && <p className="error form-error">{saveError}</p>}
        {exportMessage && <p className="export-message">{exportMessage}</p>}

        {form.entry.key.trim() && (
          <div className="bibtex-preview">
            <div className="bibtex-preview-header">
              <h4>BibTeX</h4>
              <button type="button" onClick={() => handleExportBibtex('copy')}>
                Copiar
              </button>
            </div>
            <pre>{bibtexPreview}</pre>
          </div>
        )}
      </div>

      <div className="form-footer">
        <button
          type="button"
          className="primary form-save-btn"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Salvando…' : 'Salvar alterações'}
        </button>
        {!isNew && (
          <button type="button" className="danger" onClick={handleDelete}>
            Excluir
          </button>
        )}
      </div>

      {abstractExpanded && (
        <div
          className="abstract-fullscreen-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="abstract-fullscreen-title"
        >
          <div className="abstract-fullscreen">
            <div className="abstract-fullscreen-header">
              <h3 id="abstract-fullscreen-title">Abstract</h3>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setAbstractExpanded(false)}
              >
                Fechar
              </button>
            </div>
            <div className="abstract-fullscreen-body">
              <textarea
                autoFocus
                value={form.entry.fields.abstract ?? ''}
                onChange={(e) => setField('abstract', e.target.value)}
                placeholder="Resumo do artigo…"
              />
            </div>
            <div className="abstract-fullscreen-footer">
              <button
                type="button"
                className="mark-usado-btn"
                onClick={() => handleMarkFromAbstract('usado')}
              >
                Marcar como usado
              </button>
              <button
                type="button"
                className="mark-descartado-btn"
                onClick={() => handleMarkFromAbstract('descartado')}
              >
                Marcar como descartado
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
