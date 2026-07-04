import { useEffect, useRef, useState } from 'react';

import type { ArticleFilters } from '../types/referencias';
import { ARTICLE_STATUSES } from '../types/referencias';
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
        value={filters.usado ?? ''}
        onChange={(e) =>
          onChange({ ...filters, usado: e.target.value || undefined })
        }
      >
        <option value="">Usado: todos</option>
        <option value="true">Usado</option>
        <option value="false">Não usado</option>
      </select>
      <select
        value={filters.descartado ?? ''}
        onChange={(e) =>
          onChange({ ...filters, descartado: e.target.value || undefined })
        }
      >
        <option value="">Descartado: todos</option>
        <option value="true">Descartado</option>
        <option value="false">Não descartado</option>
      </select>
      <select
        value={filters.revisaoLiteratura ?? ''}
        onChange={(e) =>
          onChange({ ...filters, revisaoLiteratura: e.target.value || undefined })
        }
      >
        <option value="">Rev. literatura: todos</option>
        <option value="true">Revisão da literatura</option>
        <option value="false">Não é revisão</option>
      </select>
    </div>
  );
}
