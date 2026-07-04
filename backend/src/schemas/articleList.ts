import { z } from 'zod';

import type { Request } from 'express';

import { MAX_PAGE_SIZE } from '../store/articleQuery.js';
import type { ArticleListParams, SortColumn } from '../types/referencias.js';

const sortColumns = [
  'title',
  'author',
  'year',
  'status',
  'tags',
  'usado',
  'descartado',
  'revisaoLiteratura',
] as const satisfies readonly SortColumn[];

export function parseArticleFilters(query: Request['query']) {
  return parseArticleListParams(query);
}

export function parseArticleListParams(query: Request['query']): ArticleListParams {
  const tagsRaw = query.tags;
  const tags =
    typeof tagsRaw === 'string' && tagsRaw.length > 0
      ? tagsRaw.split(';').map((t) => t.trim()).filter(Boolean)
      : undefined;

  const usado =
    query.usado === 'true' ? true : query.usado === 'false' ? false : undefined;
  const descartado =
    query.descartado === 'true'
      ? true
      : query.descartado === 'false'
        ? false
        : undefined;
  const revisaoLiteratura =
    query.revisaoLiteratura === 'true'
      ? true
      : query.revisaoLiteratura === 'false'
        ? false
        : undefined;

  const pageRaw = typeof query.page === 'string' ? Number(query.page) : undefined;
  const pageSizeRaw =
    typeof query.pageSize === 'string' ? Number(query.pageSize) : undefined;

  const sortByRaw = typeof query.sortBy === 'string' ? query.sortBy : undefined;
  const sortBy = sortColumns.includes(sortByRaw as SortColumn)
    ? (sortByRaw as SortColumn)
    : undefined;

  const sortDir =
    query.sortDir === 'desc' ? 'desc' : query.sortDir === 'asc' ? 'asc' : undefined;

  return {
    q: typeof query.q === 'string' ? query.q : undefined,
    tags,
    status: typeof query.status === 'string' ? query.status : undefined,
    usado,
    descartado,
    revisaoLiteratura,
    page: pageRaw !== undefined && !Number.isNaN(pageRaw) ? Math.max(1, pageRaw) : undefined,
    pageSize:
      pageSizeRaw !== undefined && !Number.isNaN(pageSizeRaw)
        ? Math.min(MAX_PAGE_SIZE, Math.max(1, pageSizeRaw))
        : undefined,
    sortBy,
    sortDir,
    findKey: typeof query.findKey === 'string' ? query.findKey : undefined,
  };
}

export const exportArticlesSchema = z.object({
  keys: z.array(z.string().min(1)).min(1),
});
