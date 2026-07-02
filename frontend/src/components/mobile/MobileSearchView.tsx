import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api } from '../../api/dataProvider';
import { MobileArticleDetail } from './MobileArticleDetail';

export function MobileSearchView() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [openTarget, setOpenTarget] = useState<{ groupId: number; key: string } | null>(null);

  const handleSearch = () => setDebouncedQ(q.trim());

  const { data, isLoading } = useQuery({
    queryKey: ['mobile-search', debouncedQ],
    queryFn: () => api.search({ q: debouncedQ, pageSize: 30 }),
    enabled: debouncedQ.length > 0,
  });

  const results = useMemo(() => data?.items ?? [], [data]);

  if (openTarget) {
    return (
      <MobileArticleDetail
        groupId={openTarget.groupId}
        articleKey={openTarget.key}
        onBack={() => setOpenTarget(null)}
      />
    );
  }

  return (
    <div className="mobile-view">
      <div className="mobile-search-bar">
        <input
          type="search"
          placeholder="Buscar em todos os grupos…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button type="button" className="primary" onClick={handleSearch}>
          Buscar
        </button>
      </div>

      {isLoading && <p className="mobile-loading">Buscando…</p>}

      {!debouncedQ && <p className="mobile-hint">Digite termos para buscar artigos.</p>}

      <div className="mobile-search-results">
        {results.map((r) => (
          <button
            key={`${r.groupId}-${r.article.entry.key}`}
            type="button"
            className="mobile-search-item"
            onClick={() => setOpenTarget({ groupId: r.groupId, key: r.article.entry.key })}
          >
            <strong>{r.article.entry.fields.title || r.article.entry.key}</strong>
            <span className="mobile-search-group">{r.groupTitle}</span>
            {r.article.entry.fields.author && (
              <span className="mobile-search-author">{r.article.entry.fields.author}</span>
            )}
          </button>
        ))}
      </div>

      {debouncedQ && !isLoading && results.length === 0 && (
        <p className="mobile-empty">Nenhum resultado.</p>
      )}
    </div>
  );
}
