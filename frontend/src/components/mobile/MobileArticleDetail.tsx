import { useState } from 'react';

import { useArticle, useUpdateArticle } from '../../hooks/useApi';
import { openPdf } from '../../pdf/pdfCache';
import { ARTICLE_STATUSES } from '../../types/referencias';

interface MobileArticleDetailProps {
  groupId: number;
  articleKey: string;
  onBack: () => void;
}

export function MobileArticleDetail({ groupId, articleKey, onBack }: MobileArticleDetailProps) {
  const { data: article, isLoading } = useArticle(groupId, articleKey);
  const updateArticle = useUpdateArticle(groupId);
  const [notes, setNotes] = useState<string | null>(null);
  const [tagsText, setTagsText] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  if (isLoading || !article) {
    return (
      <div className="mobile-detail">
        <header className="mobile-detail-header">
          <button type="button" onClick={onBack}>
            ← Voltar
          </button>
        </header>
        <p className="mobile-loading">Carregando…</p>
      </div>
    );
  }

  const currentNotes = notes ?? article.notes;
  const currentTags = tagsText ?? article.tags.join(', ');
  const title = article.entry.fields.title || article.entry.key;

  const handleSave = async () => {
    const tags = currentTags
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    await updateArticle.mutateAsync({
      key: articleKey,
      patch: { notes: currentNotes, tags },
    });
    setNotes(null);
    setTagsText(null);
  };

  const handleOpenPdf = async () => {
    if (!article.caminho) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      await openPdf(article.caminho);
    } catch (err) {
      setPdfError((err as Error).message);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="mobile-detail">
      <header className="mobile-detail-header">
        <button type="button" onClick={onBack}>
          ← Voltar
        </button>
        <h2>{title}</h2>
      </header>

      <div className="mobile-detail-body">
        {article.entry.fields.author && (
          <p>
            <strong>Autor:</strong> {article.entry.fields.author}
          </p>
        )}
        {article.entry.fields.year && (
          <p>
            <strong>Ano:</strong> {article.entry.fields.year}
          </p>
        )}
        {article.entry.fields.doi && (
          <p>
            <strong>DOI:</strong> {article.entry.fields.doi}
          </p>
        )}

        <label className="field">
          <span>Status</span>
          <select
            value={article.status}
            onChange={(e) =>
              void updateArticle.mutateAsync({ key: articleKey, patch: { status: e.target.value } })
            }
          >
            {ARTICLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Notas</span>
          <textarea
            rows={4}
            value={currentNotes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => void handleSave()}
          />
        </label>

        <label className="field">
          <span>Tags (separadas por vírgula)</span>
          <input
            value={currentTags}
            onChange={(e) => setTagsText(e.target.value)}
            onBlur={() => void handleSave()}
          />
        </label>

        {article.entry.fields.abstract && (
          <div className="mobile-abstract">
            <strong>Abstract</strong>
            <p>{article.entry.fields.abstract}</p>
          </div>
        )}

        <div className="mobile-detail-toggles">
          <button
            type="button"
            className={article.usado ? 'toggle active' : 'toggle'}
            onClick={() =>
              void updateArticle.mutateAsync({
                key: articleKey,
                patch: { usado: !article.usado },
              })
            }
          >
            {article.usado ? '✓ Usado' : 'Marcar usado'}
          </button>
          <button
            type="button"
            className={article.descartado ? 'toggle active danger' : 'toggle'}
            onClick={() =>
              void updateArticle.mutateAsync({
                key: articleKey,
                patch: { descartado: !article.descartado },
              })
            }
          >
            {article.descartado ? '✓ Descartado' : 'Marcar descartado'}
          </button>
        </div>

        {article.caminho && (
          <div className="mobile-pdf-section">
            <button type="button" className="primary" disabled={pdfLoading} onClick={() => void handleOpenPdf()}>
              {pdfLoading ? 'Baixando PDF…' : 'Abrir PDF'}
            </button>
            {pdfError && <p className="error">{pdfError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
