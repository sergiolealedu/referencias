import type {
  Article,
  ArticleFilters,
  ArticleListParams,
  PaginatedArticles,
  PaginatedSearchResults,
  SearchResult,
  SortColumn,
  SortDirection,
} from '../types/referencias.js';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export function matchesFilters(article: Article, filters: ArticleFilters): boolean {
  if (filters.status && article.status !== filters.status) return false;
  if (filters.usado !== undefined && article.usado !== filters.usado) return false;
  if (filters.descartado !== undefined && article.descartado !== filters.descartado) return false;

  if (filters.tags && filters.tags.length > 0) {
    const hasAllTags = filters.tags.every((tag) => article.tags.includes(tag));
    if (!hasAllTags) return false;
  }

  if (filters.q) {
    const q = filters.q.toLowerCase();
    const haystack = [
      article.entry.key,
      article.entry.fields.title,
      article.entry.fields.author,
      article.entry.fields.journal,
      article.notes,
      article.source,
      ...article.tags,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!haystack.includes(q)) return false;
  }

  return true;
}

function getSortValue(article: Article, column: SortColumn): string | number | boolean {
  switch (column) {
    case 'title':
      return (article.entry.fields.title || article.entry.key).toLowerCase();
    case 'author':
      return (article.entry.fields.author ?? '').toLowerCase();
    case 'year': {
      const year = Number(article.entry.fields.year);
      return Number.isNaN(year) ? 0 : year;
    }
    case 'status':
      return article.status.toLowerCase();
    case 'tags':
      return article.tags.join(', ').toLowerCase();
    case 'usado':
      return article.usado;
    case 'descartado':
      return article.descartado;
  }
}

function compareValues(a: string | number | boolean, b: string | number | boolean): number {
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return Number(a) - Number(b);
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' });
}

export function sortArticles(
  articles: Article[],
  sortBy?: SortColumn,
  sortDir: SortDirection = 'asc',
): Article[] {
  if (!sortBy) return articles;
  const sorted = [...articles].sort((a, b) => {
    const cmp = compareValues(getSortValue(a, sortBy), getSortValue(b, sortBy));
    return sortDir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

export function normalizeListParams(params: ArticleListParams = {}): {
  filters: ArticleFilters;
  page: number;
  pageSize: number;
  sortBy?: SortColumn;
  sortDir: SortDirection;
  findKey?: string;
} {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  return {
    filters: {
      q: params.q,
      tags: params.tags,
      status: params.status,
      usado: params.usado,
      descartado: params.descartado,
    },
    page,
    pageSize,
    sortBy: params.sortBy,
    sortDir: params.sortDir ?? 'asc',
    findKey: params.findKey,
  };
}

export function paginateArticles(
  articles: Article[],
  params: ArticleListParams = {},
): PaginatedArticles {
  const { filters, page, pageSize, sortBy, sortDir, findKey } = normalizeListParams(params);
  const filtered = articles.filter((a) => matchesFilters(a, filters));
  const sorted = sortArticles(filtered, sortBy, sortDir);
  const total = sorted.length;

  let foundPage: number | undefined;
  if (findKey) {
    const index = sorted.findIndex((a) => a.entry.key === findKey);
    if (index >= 0) {
      foundPage = Math.floor(index / pageSize) + 1;
    }
  }

  const effectivePage = foundPage ?? page;
  const start = (effectivePage - 1) * pageSize;
  const items = sorted.slice(start, start + pageSize).map((a) => structuredClone(a));

  return {
    items,
    total,
    page: effectivePage,
    pageSize,
    ...(foundPage !== undefined ? { foundPage } : {}),
  };
}

export function paginateSearchResults(
  results: SearchResult[],
  params: ArticleListParams = {},
): PaginatedSearchResults {
  const { filters, page, pageSize, sortBy, sortDir } = normalizeListParams(params);
  const filtered = results.filter((r) => matchesFilters(r.article, filters));

  let sorted = filtered;
  if (sortBy) {
    sorted = [...filtered].sort((a, b) => {
      const cmp = compareValues(
        getSortValue(a.article, sortBy),
        getSortValue(b.article, sortBy),
      );
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  const total = sorted.length;
  const start = (page - 1) * pageSize;
  const items = sorted.slice(start, start + pageSize).map((r) => ({
    ...r,
    article: structuredClone(r.article),
  }));

  return { items, total, page, pageSize };
}

export const SORT_COLUMN_SQL: Record<SortColumn, string> = {
  title: "COALESCE(json_extract(fields_json, '$.title'), entry_key)",
  author: "COALESCE(json_extract(fields_json, '$.author'), '')",
  year: "CAST(COALESCE(NULLIF(json_extract(fields_json, '$.year'), ''), '0') AS INTEGER)",
  status: 'status',
  tags: 'tags_json',
  usado: 'usado',
  descartado: 'descartado',
};
