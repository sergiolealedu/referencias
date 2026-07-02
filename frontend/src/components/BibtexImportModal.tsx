import { useEffect, useMemo, useState } from 'react';

import { useArticles, useGroups, useImportBibtex } from '../hooks/useApi';
import type { Article, BibtexImportResult } from '../types/referencias';

type OriginArticleSort = 'id' | 'title';
type OriginSortDirection = 'asc' | 'desc';

function sortOriginArticles(
  articles: Article[],
  sortBy: OriginArticleSort,
  direction: OriginSortDirection,
): Article[] {
  return [...articles].sort((a, b) => {
    const aValue =
      sortBy === 'id'
        ? a.entry.key.toLowerCase()
        : (a.entry.fields.title || a.entry.key).toLowerCase();
    const bValue =
      sortBy === 'id'
        ? b.entry.key.toLowerCase()
        : (b.entry.fields.title || b.entry.key).toLowerCase();
    const cmp = aValue.localeCompare(bValue, 'pt-BR', { sensitivity: 'base' });
    return direction === 'asc' ? cmp : -cmp;
  });
}

interface BibtexImportModalProps {
  groupId: number;
  groupTitle: string;
  onClose: () => void;
}

export function BibtexImportModal({ groupId, groupTitle, onClose }: BibtexImportModalProps) {
  const { data: groups = [] } = useGroups();
  const [bibtex, setBibtex] = useState('');
  const [source, setSource] = useState('');
  const [useOrigin, setUseOrigin] = useState(false);
  const [originGroupId, setOriginGroupId] = useState<number | null>(null);
  const [originKey, setOriginKey] = useState('');
  const [originArticleSort, setOriginArticleSort] = useState<OriginArticleSort>('title');
  const [originArticleSortDir, setOriginArticleSortDir] =
    useState<OriginSortDirection>('asc');
  const [result, setResult] = useState<BibtexImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: originArticlesPage, isLoading: originArticlesLoading } = useArticles(
    useOrigin ? originGroupId : null,
    { pageSize: 200, sortBy: originArticleSort === 'id' ? undefined : 'title' },
  );

  const originArticles = originArticlesPage?.items ?? [];

  const importBibtex = useImportBibtex(groupId);

  const originGroupTitle = useMemo(
    () => groups.find((g) => g.id === originGroupId)?.title ?? '',
    [groups, originGroupId],
  );

  const originPreview = useMemo(
    () => originArticles.find((a) => a.entry.key === originKey) ?? null,
    [originArticles, originKey],
  );

  const sortedOriginArticles = useMemo(
    () => sortOriginArticles(originArticles, originArticleSort, originArticleSortDir),
    [originArticles, originArticleSort, originArticleSortDir],
  );

  useEffect(() => {
    setOriginKey('');
  }, [originGroupId]);

  const handleOriginArticleSort = (column: OriginArticleSort) => {
    if (originArticleSort === column) {
      setOriginArticleSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setOriginArticleSort(column);
      setOriginArticleSortDir('asc');
    }
  };

  const sortIndicator = (column: OriginArticleSort) => {
    if (originArticleSort !== column) return ' ⇅';
    return originArticleSortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const handleImport = async () => {
    setError(null);
    setResult(null);
    if (!bibtex.trim()) {
      setError('Cole o conteúdo BibTeX para importar.');
      return;
    }

    let originArticle: { groupId: number; key: string } | undefined;
    if (useOrigin) {
      if (originGroupId === null || !originKey.trim()) {
        setError('Selecione o grupo e o artigo de origem, ou desative a opção.');
        return;
      }
      if (!originPreview) {
        setError('Artigo de origem não encontrado no grupo selecionado.');
        return;
      }
      originArticle = { groupId: originGroupId, key: originKey.trim() };
    }

    try {
      const importResult = await importBibtex.mutateAsync({
        bibtex,
        source: source.trim(),
        originArticle,
      });
      setResult(importResult);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal bibtex-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Importar BibTeX</h3>
          <button type="button" className="form-close" onClick={onClose} title="Fechar">
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-subtitle">
            Destino: <strong>{groupTitle}</strong>
          </p>

          <label>
            Origem (campo source dos artigos)
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Ex.: Gleison, Undermind, Zotero..."
            />
          </label>

          <label>
            BibTeX
            <textarea
              rows={12}
              value={bibtex}
              onChange={(e) => setBibtex(e.target.value)}
              placeholder={'@article{chave2024,\n  title = {Título},\n  author = {Autor},\n  year = {2024}\n}'}
            />
          </label>

          <div className="origin-section">
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={useOrigin}
                onChange={(e) => {
                  setUseOrigin(e.target.checked);
                  if (!e.target.checked) {
                    setOriginGroupId(null);
                    setOriginKey('');
                  }
                }}
              />
              Vincular ao grupo de um artigo de origem
            </label>
            <p className="hint">
              Entradas com a mesma chave no grupo do artigo de origem serão marcadas como
              duplicata e apontarão para esse grupo.
            </p>

            {useOrigin && (
              <div className="origin-fields">
                <label>
                  Grupo de origem
                  <select
                    value={originGroupId ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setOriginGroupId(value ? Number(value) : null);
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

                <div className="origin-article-picker">
                  <span className="origin-article-picker-label">Artigo de origem</span>

                  {originGroupId === null ? (
                    <p className="hint">Selecione um grupo primeiro.</p>
                  ) : originArticlesLoading ? (
                    <p className="hint">Carregando artigos...</p>
                  ) : sortedOriginArticles.length === 0 ? (
                    <p className="hint">Nenhum artigo neste grupo.</p>
                  ) : (
                    <>
                      <div className="origin-article-list-header">
                        <button
                          type="button"
                          className={`origin-sort-btn id-col${originArticleSort === 'id' ? ' active' : ''}`}
                          onClick={() => handleOriginArticleSort('id')}
                        >
                          ID
                          <span className="sort-indicator" aria-hidden="true">
                            {sortIndicator('id')}
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`origin-sort-btn title-col${originArticleSort === 'title' ? ' active' : ''}`}
                          onClick={() => handleOriginArticleSort('title')}
                        >
                          Título
                          <span className="sort-indicator" aria-hidden="true">
                            {sortIndicator('title')}
                          </span>
                        </button>
                      </div>

                      <ul className="origin-article-list">
                        {sortedOriginArticles.map((article) => (
                          <li key={article.entry.key}>
                            <button
                              type="button"
                              className={
                                originKey === article.entry.key
                                  ? 'origin-article-item selected'
                                  : 'origin-article-item'
                              }
                              onClick={() => setOriginKey(article.entry.key)}
                            >
                              <span className="origin-article-id">{article.entry.key}</span>
                              <span className="origin-article-title">
                                {article.entry.fields.title || '—'}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>

                {originPreview && (
                  <div className="origin-preview">
                    <span className="origin-article-id">{originPreview.entry.key}</span>
                    <div className="origin-preview-text">
                      <strong>
                        {originPreview.entry.fields.title || originPreview.entry.key}
                      </strong>
                      <span>{originGroupTitle}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <pre className="error">{error}</pre>}

          {result && (
            <div className="import-result">
              <p>
                <strong>{result.imported}</strong> importado(s),{' '}
                <strong>{result.duplicates}</strong> duplicata(s),{' '}
                <strong>{result.skipped}</strong> ignorado(s) de {result.parsed} parseado(s).
              </p>
              {result.parseErrors && result.parseErrors.length > 0 && (
                <div className="parse-errors">
                  <p>
                    <strong>{result.parseErrors.length}</strong> entrada(s) com erro de parse:
                  </p>
                  <ul>
                    {result.parseErrors.map((item) => (
                      <li key={`${item.type}-${item.key}`}>
                        <code>{item.key}</code> (@{item.type}) — {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.items.length > 0 && (
                <ul>
                  {result.items.map((item) => (
                    <li key={item.key}>
                      <code>{item.key}</code> — {item.outcome}
                      {item.message ? ` (${item.message})` : ''}
                    </li>
                  ))}
                </ul>
              )}
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
            disabled={importBibtex.isPending}
          >
            {importBibtex.isPending ? 'Importando…' : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
