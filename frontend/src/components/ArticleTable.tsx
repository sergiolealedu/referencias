import { useEffect, useRef, useState } from 'react';

import { api } from '../api/client';
import { useUpdateArticle, useUploadArticlePdf } from '../hooks/useApi';
import type { Article, SortColumn, SortDirection } from '../types/referencias';
import {
  copyBibtexBulkToClipboard,
  downloadBibtexBulk,
} from '../utils/bibtexExport';

const PAGE_SIZE_OPTIONS = [20, 50] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: 'title', label: 'Título' },
  { key: 'author', label: 'Autor' },
  { key: 'year', label: 'Ano' },
  { key: 'status', label: 'Status' },
  { key: 'tags', label: 'Tags' },
  { key: 'usado', label: 'Usado' },
  { key: 'descartado', label: 'Desc.' },
];

interface ArticleTableProps {
  groupId: number;
  articles: Article[];
  total: number;
  page: number;
  pageSize: PageSize;
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onNavigateToArticle?: (groupId: number, key: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
  onSortChange: (column: SortColumn | null, direction: SortDirection) => void;
}

export function ArticleTable({
  groupId,
  articles,
  total,
  page,
  pageSize,
  sortColumn,
  sortDirection,
  selectedKey,
  onSelect,
  onNavigateToArticle,
  onPageChange,
  onPageSizeChange,
  onSortChange,
}: ArticleTableProps) {
  const updateArticle = useUpdateArticle(groupId);
  const uploadPdf = useUploadArticlePdf(groupId);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfTargetKey, setPdfTargetKey] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const pageVisibleKeys = new Set(articles.map((a) => a.entry.key));

  const allPageSelected =
    articles.length > 0 && articles.every((a) => checkedKeys.has(a.entry.key));

  const somePageSelected =
    !allPageSelected && articles.some((a) => checkedKeys.has(a.entry.key));

  useEffect(() => {
    setCheckedKeys(new Set());
    setExportMessage(null);
  }, [groupId]);

  useEffect(() => {
    if (!selectedKey) return;
    requestAnimationFrame(() => {
      const row = document.querySelector(
        `tr[data-article-key="${CSS.escape(selectedKey)}"]`,
      );
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [selectedKey, articles]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      onSortChange(column, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(column, 'asc');
    }
    onPageChange(1);
  };

  const toggleField = async (article: Article, field: 'usado' | 'descartado') => {
    await updateArticle.mutateAsync({
      key: article.entry.key,
      patch: { [field]: !article[field] },
    });
  };

  const handleUploadPdf = (key: string) => {
    setPdfTargetKey(key);
    setPdfMessage(null);
    pdfInputRef.current?.click();
  };

  const handleOpenPdf = async (article: Article) => {
    if (!article.caminho.trim()) return;
    setPdfMessage(null);
    try {
      await api.openPdf(article.caminho);
    } catch (err) {
      setPdfMessage((err as Error).message);
    }
  };

  const toggleChecked = (key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllPage = () => {
    if (allPageSelected) {
      setCheckedKeys((prev) => {
        const next = new Set(prev);
        for (const key of pageVisibleKeys) next.delete(key);
        return next;
      });
    } else {
      setCheckedKeys((prev) => {
        const next = new Set(prev);
        for (const key of pageVisibleKeys) next.add(key);
        return next;
      });
    }
  };

  const fetchSelectedArticles = async (): Promise<Article[]> => {
    if (checkedKeys.size === 0) return [];
    return api.exportArticles(groupId, [...checkedKeys]);
  };

  const handleCopyBibtex = async () => {
    setExportMessage(null);
    try {
      const selected = await fetchSelectedArticles();
      await copyBibtexBulkToClipboard(selected);
      setExportMessage(
        `${selected.length} entrada(s) copiada(s) para a área de transferência.`,
      );
    } catch (err) {
      setExportMessage((err as Error).message);
    }
  };

  const handleDownloadBibtex = async () => {
    setExportMessage(null);
    try {
      const selected = await fetchSelectedArticles();
      downloadBibtexBulk(selected);
      setExportMessage(`${selected.length} entrada(s) exportada(s).`);
    } catch (err) {
      setExportMessage((err as Error).message);
    }
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  if (total === 0) {
    return <p className="empty-state">Nenhum artigo encontrado com os filtros atuais.</p>;
  }

  return (
    <div className="article-table-panel">
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="visually-hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const key = pdfTargetKey;
          e.target.value = '';
          setPdfTargetKey(null);
          if (!file || !key) return;
          void (async () => {
            setPdfMessage(null);
            setUploadingKey(key);
            try {
              await uploadPdf.mutateAsync({ key, file });
              setPdfMessage(`PDF enviado para ${key}.`);
            } catch (err) {
              setPdfMessage((err as Error).message);
            } finally {
              setUploadingKey(null);
            }
          })();
        }}
      />
      {pdfMessage && <p className="hint pdf-table-message">{pdfMessage}</p>}
      {checkedKeys.size > 0 && (
        <div className="bulk-actions">
          <span className="bulk-actions-count">
            {checkedKeys.size} selecionada(s)
          </span>
          <button type="button" onClick={() => setCheckedKeys(new Set())}>
            Limpar seleção
          </button>
          <button type="button" onClick={handleCopyBibtex}>
            Copiar BibTeX
          </button>
          <button type="button" onClick={handleDownloadBibtex}>
            Baixar .bib
          </button>
          {exportMessage && <span className="bulk-actions-message">{exportMessage}</span>}
        </div>
      )}

      <div className="article-pagination">
        <label className="article-page-size">
          Por página
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <span className="article-page-info">
          {rangeStart}–{rangeEnd} de {total}
        </span>
        <div className="article-page-nav">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            Próxima
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="article-table">
          <thead>
            <tr>
              <th className="row-num-col" aria-label="Posição">#</th>
              <th className="select-col">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = somePageSelected;
                  }}
                  onChange={toggleAllPage}
                  title={allPageSelected ? 'Desmarcar página' : 'Selecionar página'}
                  aria-label="Selecionar artigos desta página"
                />
              </th>
              {COLUMNS.map(({ key, label }) => (
                <th key={key}>
                  <button
                    type="button"
                    className={`sort-header${sortColumn === key ? ' active' : ''}`}
                    onClick={() => handleSort(key)}
                  >
                    {label}
                    <span className="sort-indicator" aria-hidden="true">
                      {sortColumn === key
                        ? sortDirection === 'asc'
                          ? ' ▲'
                          : ' ▼'
                        : ' ⇅'}
                    </span>
                  </button>
                </th>
              ))}
              <th className="pdf-col">PDF</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article, index) => (
              <tr
                key={article.entry.key}
                data-article-key={article.entry.key}
                className={selectedKey === article.entry.key ? 'selected' : ''}
                onClick={() => onSelect(article.entry.key)}
              >
                <td className="row-num-col">{(page - 1) * pageSize + index + 1}</td>
                <td className="select-col" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={checkedKeys.has(article.entry.key)}
                    onChange={() => toggleChecked(article.entry.key)}
                    aria-label={`Selecionar ${article.entry.fields.title || article.entry.key}`}
                  />
                </td>
                <td className="title-cell">
                  {article.entry.fields.title || article.entry.key}
                  {article.status === 'duplicate' && article.duplicateOf && (
                    <button
                      type="button"
                      className="duplicate-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const { groupId: dupGroupId, key } = article.duplicateOf!;
                        onNavigateToArticle?.(dupGroupId, key);
                      }}
                    >
                      dup → {article.duplicateOf.key}
                    </button>
                  )}
                </td>
                <td>{article.entry.fields.author ?? ''}</td>
                <td>{article.entry.fields.year ?? ''}</td>
                <td>
                  <span className={`status-badge status-${article.status}`}>
                    {article.status}
                  </span>
                </td>
                <td className="tags-cell">
                  {article.tags.map((tag) => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={article.usado}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleField(article, 'usado');
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={article.descartado}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleField(article, 'descartado');
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td className="pdf-col" onClick={(e) => e.stopPropagation()}>
                  <div className="pdf-row-actions">
                    <button
                      type="button"
                      className="pdf-row-btn"
                      title="Enviar PDF"
                      disabled={uploadPdf.isPending}
                      onClick={() => handleUploadPdf(article.entry.key)}
                    >
                      {uploadingKey === article.entry.key ? '…' : '↑'}
                    </button>
                    <button
                      type="button"
                      className="pdf-row-btn"
                      title={article.caminho.trim() ? 'Abrir PDF' : 'Sem PDF'}
                      disabled={!article.caminho.trim()}
                      onClick={() => void handleOpenPdf(article)}
                    >
                      PDF
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type { PageSize };
