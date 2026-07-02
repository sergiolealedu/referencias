import { useMemo, useState } from 'react';

import { useArticles, useGroups, useUpdateArticle } from '../../hooks/useApi';
import { ARTICLE_STATUSES } from '../../types/referencias';
import { ArticleCard } from './ArticleCard';
import { MobileArticleDetail } from './MobileArticleDetail';

export function MobileArticlesView() {
  const { data: groups = [] } = useGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const groupId = selectedGroupId ?? groups[0]?.id ?? null;

  const params = useMemo(
    () => ({
      q: q || undefined,
      status: status || undefined,
      page,
      pageSize: 20,
      sortBy: 'title' as const,
      sortDir: 'asc' as const,
    }),
    [q, status, page],
  );

  const { data, isLoading } = useArticles(groupId, params);
  const updateArticle = useUpdateArticle(groupId);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  if (openKey && groupId) {
    return (
      <MobileArticleDetail
        groupId={groupId}
        articleKey={openKey}
        onBack={() => setOpenKey(null)}
      />
    );
  }

  return (
    <div className="mobile-view">
      <div className="mobile-filters">
        <select
          value={groupId ?? ''}
          onChange={(e) => {
            setSelectedGroupId(Number(e.target.value));
            setPage(1);
          }}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title} ({g.articleCount})
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Buscar…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os status</option>
          {ARTICLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="mobile-loading">Carregando artigos…</p>}

      <div className="mobile-article-list">
        {data?.items.map((article) => (
          <ArticleCard
            key={article.entry.key}
            article={article}
            onOpen={() => setOpenKey(article.entry.key)}
            onToggleUsado={() =>
              void updateArticle.mutateAsync({
                key: article.entry.key,
                patch: { usado: !article.usado, descartado: article.usado ? article.descartado : false },
              })
            }
            onToggleDescartado={() =>
              void updateArticle.mutateAsync({
                key: article.entry.key,
                patch: {
                  descartado: !article.descartado,
                  usado: article.descartado ? article.usado : false,
                },
              })
            }
          />
        ))}
      </div>

      {data && data.total === 0 && <p className="mobile-empty">Nenhum artigo encontrado.</p>}

      {data && data.total > 0 && (
        <div className="mobile-pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
