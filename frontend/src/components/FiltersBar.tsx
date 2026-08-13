import { useEffect, useRef, useState } from 'react';

import type { ArticleCategoria, ArticleFilters } from '../types/referencias';
import { ARTICLE_CATEGORIAS, ARTICLE_CATEGORIA_LABELS, ARTICLE_STATUSES } from '../types/referencias';
import { TagsFilterInput } from './TagsFilterInput';

interface FiltersBarProps {
  filters: ArticleFilters;
  availableTags: string[];
  onChange: (filters: ArticleFilters) => void;
}

export function FiltersBar({ filters, availableTags, onChange }: FiltersBarProps) {
  const [qInput, setQInput] = useState(filters.q ?? '');
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    setQInput(filters.q ?? '');
  }, [filters.q]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = qInput.trim() || undefined;
      if (nextQ !== filtersRef.current.q) {
        onChange({ ...filtersRef.current, q: nextQ });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [qInput, onChange]);

  return (
    <div className="filters-bar">
      <input
        type="search"
        placeholder="Buscar título, autor, chave..."
        value={qInput}
        onChange={(e) => setQInput(e.target.value)}
      />
      <TagsFilterInput
        value={filters.tags ?? ''}
        availableTags={availableTags}
        onChange={(tags) => onChange({ ...filters, tags })}
      />
      <select
        value={filters.status ?? ''}
        onChange={(e) =>
          onChange({ ...filters, status: e.target.value || undefined })
        }
      >
        <option value="">Todos os status</option>
        {ARTICLE_STATUSES.map((status) => (
          <option key={status} value={status}>{status}</option>
        ))}
      </select>
      <select
        value={filters.categoria ?? ''}
        onChange={(e) =>
          onChange({
            ...filters,
            categoria: (e.target.value as ArticleCategoria) || undefined,
          })
        }
      >
        <option value="">Categoria: todas</option>
        {ARTICLE_CATEGORIAS.map((categoria) => (
          <option key={categoria} value={categoria}>
            {ARTICLE_CATEGORIA_LABELS[categoria]}
          </option>
        ))}
      </select>
    </div>
  );
}
