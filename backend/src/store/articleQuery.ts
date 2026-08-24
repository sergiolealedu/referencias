import type {
  ArticleFilters,
  ArticleListParams,
  SortColumn,
  SortDirection,
} from '../types/referencias.js';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

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
      categoria: params.categoria,
      usado: params.usado,
      descartado: params.descartado,
      revisaoLiteratura: params.revisaoLiteratura,
      pdfNaoEncontrado: params.pdfNaoEncontrado,
    },
    page,
    pageSize,
    sortBy: params.sortBy,
    sortDir: params.sortDir ?? 'asc',
    findKey: params.findKey,
  };
}

export const SORT_COLUMN_SQL: Record<SortColumn, string> = {
  title: "COALESCE(json_extract(fields_json, '$.title'), entry_key)",
  author: "COALESCE(json_extract(fields_json, '$.author'), '')",
  year: "CAST(COALESCE(NULLIF(json_extract(fields_json, '$.year'), ''), '0') AS INTEGER)",
  status: 'status',
  tags: 'tags_json',
  usado: 'usado',
  descartado: 'descartado',
  revisaoLiteratura: 'revisao_literatura',
  pdfNaoEncontrado: 'pdf_nao_encontrado',
};
