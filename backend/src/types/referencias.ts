export interface DuplicateRef {
  groupId: number;
  key: string;
}

export interface Entry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

export interface Article {
  entry: Entry;
  status: string;
  source: string;
  location: string;
  caminho: string;
  notes: string;
  tags: string[];
  descartado: boolean;
  usado: boolean;
  duplicateOf?: DuplicateRef;
}

export interface GroupMeta {
  id: number;
  title: string;
  versao: string;
  mecanismo: string;
  stringBusca: string;
  createdAt: string;
  articleCount: number;
}

/** @deprecated use GroupMeta — grupos não carregam mais artigos embutidos */
export interface Group extends GroupMeta {
  articles: Article[];
}

export interface ReferenciasData {
  groups: Group[];
}

export interface GroupSummary {
  id: number;
  title: string;
  versao: string;
  mecanismo: string;
  stringBusca: string;
  createdAt: string;
  articleCount: number;
}

export interface ArticleFilters {
  q?: string;
  tags?: string[];
  status?: string;
  usado?: boolean;
  descartado?: boolean;
}

export type SortColumn =
  | 'title'
  | 'author'
  | 'year'
  | 'status'
  | 'tags'
  | 'usado'
  | 'descartado';

export type SortDirection = 'asc' | 'desc';

export interface ArticleListParams extends ArticleFilters {
  page?: number;
  pageSize?: number;
  sortBy?: SortColumn;
  sortDir?: SortDirection;
  findKey?: string;
}

export interface PaginatedArticles {
  items: Article[];
  total: number;
  page: number;
  pageSize: number;
  foundPage?: number;
}

export interface PaginatedSearchResults {
  items: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchResult {
  groupId: number;
  groupTitle: string;
  article: Article;
}

export interface BibtexParseError {
  key: string;
  type: string;
  reason: string;
}

export interface BibtexImportItemResult {
  key: string;
  outcome: 'imported' | 'skipped' | 'duplicate';
  message?: string;
}

export interface BibtexImportResult {
  parsed: number;
  imported: number;
  skipped: number;
  duplicates: number;
  items: BibtexImportItemResult[];
  parseErrors?: BibtexParseError[];
}

export interface BibtexImportOptions {
  source: string;
  originArticle?: { groupId: number; key: string };
}

export interface YearArticleStats {
  year: number;
  usados: number;
  descartados: number;
  outros: number;
  repetidos: number;
  unicos: number;
}

export interface DuplicateDetectionResult {
  scanned: number;
  marked: number;
  cleared: number;
  unchanged: number;
}

export interface GroupArticleStats {
  groupId: number;
  groupTitle: string;
  versao: string;
  series: YearArticleStats[];
}
