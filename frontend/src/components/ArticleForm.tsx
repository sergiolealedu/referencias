import { useEffect, useRef, useState } from 'react';

import { api } from '../api/client';
import {
  useCreateArticle,
  useDeleteArticle,
  useDeleteArticlePdf,
  useFactors,
  useUpdateArticle,
  useUploadArticlePdf,
} from '../hooks/useApi';
import { ARTICLE_STATUSES, ENTRY_TYPES, type Article } from '../types/referencias';
import { emptyArticle } from '../types/referencias';
import { articleToBibtex, copyBibtexToClipboard, downloadBibtex } from '../utils/bibtexExport';
import {
  articleFactorsToDrafts,
  draftsToArticleFactorInputs,
  type FactorRowDraft,
} from '../utils/factors';
import { DomainSelect } from './DomainSelect';
import { FactorsPanel } from './FactorsPanel';
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

const CITATION_FIELDS = [
  'title',
  'author',
  'editor',
  'journal',
  'booktitle',
  'year',
  'month',
] as const;

const PUBLICATION_FIELDS = [
  'volume',
  'number',
  'pages',
  'publisher',
  'isbn',
  'series',
  'address',
] as const;

const LINK_FIELDS = ['doi', 'url', 'howpublished'] as const;

type FormTabId = 'referencia' | 'abstract' | 'links' | 'gestao';

const FORM_TABS: {
  id: FormTabId;
  label: string;
  icon: string;
}[] = [
  { id: 'referencia', label: 'Referência', icon: '📚' },
  { id: 'abstract', label: 'Abstract', icon: '📝' },
  { id: 'links', label: 'Links', icon: '🔗' },
  { id: 'gestao', label: 'Gestão', icon: '⚙️' },
];

export function ArticleForm({
  groupId,
  article,
  isNew,
  onClose,
  onSaved,
}: ArticleFormProps) {
  const [form, setForm] = useState<Article>(article ?? emptyArticle());
  const [factorRows, setFactorRows] = useState<FactorRowDraft[]>([]);
  const [extraFieldKey, setExtraFieldKey] = useState('');
  const [extraFieldValue, setExtraFieldValue] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);
  const [abstractExpanded, setAbstractExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<FormTabId>('referencia');
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const { data: factorCatalog = [] } = useFactors();
  const createArticle = useCreateArticle(groupId);
  const updateArticle = useUpdateArticle(groupId);
  const deleteArticle = useDeleteArticle(groupId);
  const uploadPdf = useUploadArticlePdf(groupId);
  const deletePdf = useDeleteArticlePdf(groupId);
  const isSaving = createArticle.isPending || updateArticle.isPending;
  const isPdfBusy = uploadPdf.isPending || deletePdf.isPending;

  useEffect(() => {
    const next = normalizeArticleForForm(article ?? emptyArticle());
    setForm(next);
    setFactorRows(articleFactorsToDrafts(next.factors, factorCatalog));
    setSaveError(null);
    setExportMessage(null);
    setPdfMessage(null);
    setAbstractExpanded(false);
    setActiveTab('referencia');
  }, [article, isNew]);

  useEffect(() => {
    setFactorRows((prev) => {
      if (prev.length === 0 && (article?.factors?.length ?? 0) > 0) {
        return articleFactorsToDrafts(article?.factors, factorCatalog);
      }
      return prev;
    });
  }, [factorCatalog, article?.factors]);

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

  const buildPayload = () => ({
    ...normalizeArticleForForm(form),
    factors: draftsToArticleFactorInputs(factorRows),
  });

  const handleSave = async () => {
    if (!form.entry.key.trim()) {
      window.alert('A chave (key) do artigo é obrigatória.');
      return;
    }
    setSaveError(null);
    try {
      const payload = buildPayload();
      if (isNew) {
        await createArticle.mutateAsync(payload);
      } else if (article) {
        await updateArticle.mutateAsync({
          key: article.entry.key,
          patch: payload,
        });
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
      const payload = {
        ...normalizeArticleForForm(updated),
        factors: draftsToArticleFactorInputs(factorRows),
      };
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
        <div className="form-header-actions">
          {form.entry.key.trim() && (
            <>
              <button
                type="button"
                className="form-header-icon-btn"
                onClick={() => handleExportBibtex('copy')}
                title="Copiar BibTeX"
                aria-label="Copiar BibTeX"
              >
                📋
              </button>
              <button
                type="button"
                className="form-header-icon-btn"
                onClick={() => handleExportBibtex('download')}
                title="Baixar arquivo .bib"
                aria-label="Baixar arquivo .bib"
              >
                ⬇
              </button>
            </>
          )}
          <button
            type="button"
            className="form-header-icon-btn form-header-icon-btn--primary"
            onClick={handleSave}
            disabled={isSaving}
            title={isSaving ? 'Salvando…' : 'Salvar'}
            aria-label={isSaving ? 'Salvando…' : 'Salvar'}
          >
            ✓
          </button>
          <button
            type="button"
            className="form-header-icon-btn"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
      </div>

      <div
        className="form-tabs"
        role="tablist"
        aria-label="Seções do artigo"
      >
        {FORM_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`form-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`form-panel-${tab.id}`}
            className={`form-tab${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
          >
            <span className="form-tab-icon" aria-hidden>
              {tab.icon}
            </span>
            <span className="form-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="form-body">
        {activeTab === 'referencia' && (
          <div
            id="form-panel-referencia"
            className="form-tab-panel"
            role="tabpanel"
            aria-labelledby="form-tab-referencia"
          >
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

            {CITATION_FIELDS.map((key) => renderEntryField(key))}
            {PUBLICATION_FIELDS.map((key) => renderEntryField(key))}
          </div>
        )}

        {activeTab === 'abstract' && (
          <div
            id="form-panel-abstract"
            className="form-tab-panel"
            role="tabpanel"
            aria-labelledby="form-tab-abstract"
          >
            {renderEntryField('abstract')}
          </div>
        )}

        {activeTab === 'links' && (
          <div
            id="form-panel-links"
            className="form-tab-panel"
            role="tabpanel"
            aria-labelledby="form-tab-links"
          >
            {LINK_FIELDS.map((key) => renderEntryField(key))}

            {extraFields.length > 0 && (
              <div className="extra-fields">
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
          </div>
        )}

        {activeTab === 'gestao' && (
          <div
            id="form-panel-gestao"
            className="form-tab-panel"
            role="tabpanel"
            aria-labelledby="form-tab-gestao"
          >
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
              <label>
                <input
                  type="checkbox"
                  checked={form.revisaoLiteratura}
                  onChange={(e) => setRoot('revisaoLiteratura', e.target.checked)}
                />
                Revisão da literatura
              </label>
            </div>

            <div className="form-panel-divider" />

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

            {form.entry.key.trim() && (
              <>
                <div className="form-panel-divider" />
                <div className="bibtex-preview">
                  <div className="bibtex-preview-header">
                    <h4>Pré-visualização BibTeX</h4>
                    <button type="button" onClick={() => handleExportBibtex('copy')}>
                      Copiar
                    </button>
                  </div>
                  <pre>{bibtexPreview}</pre>
                </div>
              </>
            )}
          </div>
        )}

        {saveError && <p className="error form-error">{saveError}</p>}
        {exportMessage && <p className="export-message">{exportMessage}</p>}
      </div>

      <div className="form-footer">
        <button
          type="button"
          className="form-header-icon-btn form-header-icon-btn--primary"
          onClick={handleSave}
          disabled={isSaving}
          title={isSaving ? 'Salvando…' : 'Salvar alterações'}
          aria-label={isSaving ? 'Salvando…' : 'Salvar alterações'}
        >
          ✓
        </button>
        {!isNew && (
          <button
            type="button"
            className="form-header-icon-btn form-header-icon-btn--danger"
            onClick={handleDelete}
            title="Excluir artigo"
            aria-label="Excluir artigo"
          >
            🗑
          </button>
        )}
      </div>

      <FactorsPanel
        rows={factorRows}
        catalog={factorCatalog}
        onChange={setFactorRows}
      />

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
