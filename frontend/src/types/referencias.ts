export interface DuplicateRef {
  groupId: number;
  key: string;
}

export interface Entry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

export const ARTICLE_STATUSES = [
  'exists',
  'duplicate',
  'not_found',
  'gray',
  'manual_review',
] as const;

export type ArticleStatus = typeof ARTICLE_STATUSES[number];

/** Tipos BibTeX comuns; valores fora da lista continuam editáveis no formulário. */
export const ENTRY_TYPES = [
  'article',
  'book',
  'booklet',
  'collection',
  'conference',
  'inbook',
  'incollection',
  'inproceedings',
  'manual',
  'mastersthesis',
  'misc',
  'phdthesis',
  'proceedings',
  'techreport',
  'unpublished',
] as const;

export type FactorPolarity = 'positive' | 'negative';

/** Fator canônico do workspace, com múltiplas grafias (PT/EN). */
export interface FactorDefinition {
  id: string;
  name: string;
  aliases: string[];
}

/** Ocorrência de um fator em um artigo. */
export interface ArticleFactor {
  factorId: string;
  polarity: FactorPolarity;
  description: string;
  /** Grafia usada neste artigo. */
  label: string;
}

/** Uso de um fator em um artigo específico (visão consolidada). */
export interface FactorOccurrence {
  groupId: number;
  groupTitle: string;
  articleKey: string;
  articleTitle: string;
  articleAuthor: string;
  articleYear: string;
  polarity: FactorPolarity;
  description: string;
  label: string;
  usado: boolean;
  descartado: boolean;
  pdfNaoEncontrado: boolean;
}

/** Fator do catálogo com todas as ocorrências nos artigos. */
export interface FactorOverview {
  id: string;
  name: string;
  aliases: string[];
  articleCount: number;
  positiveCount: number;
  negativeCount: number;
  occurrences: FactorOccurrence[];
}

export interface ArticleFactorInput {
  factorId?: string;
  label: string;
  polarity: FactorPolarity;
  description?: string;
  aliases?: string[];
}

export interface Article {
  entry: Entry;
  status: string;
  source: string;
  location: string;
  caminho: string;
  notes: string;
  tags: string[];
  factors: ArticleFactor[];
  descartado: boolean;
  usado: boolean;
  revisaoLiteratura: boolean;
  pdfNaoEncontrado: boolean;
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

/** @deprecated use GroupMeta */
export interface Group extends GroupMeta {
  articles?: Article[];
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

export interface GroupInput {
  title: string;
  versao?: string;
  mecanismo?: string;
  stringBusca?: string;
}

export interface ArticleFilters {
  q?: string;
  tags?: string;
  status?: string;
  usado?: string;
  descartado?: string;
  revisaoLiteratura?: string;
  pdfNaoEncontrado?: string;
}

export type SortColumn =
  | 'title'
  | 'author'
  | 'year'
  | 'status'
  | 'tags'
  | 'usado'
  | 'descartado'
  | 'revisaoLiteratura'
  | 'pdfNaoEncontrado';

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

export interface BibtexImportInput {
  bibtex: string;
  source: string;
  originArticle?: { groupId: number; key: string };
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

export interface AppSettings {
  sqliteDbPath: string;
  allowedPdfRoots: string[];
  activeWorkspaceId?: string;
  activeWorkspaceName?: string;
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

export interface GroupExportMeta {
  title: string;
  versao: string;
  mecanismo: string;
  stringBusca: string;
  createdAt: string;
  sourceId: number;
}

export interface GroupExport {
  formatVersion: 1;
  exportedAt: string;
  group: GroupExportMeta;
  articles: Article[];
}

export interface GroupImportOptions {
  targetGroupId?: number;
  title?: string;
  onConflict?: 'skip' | 'replace';
}

export interface GroupImportResult {
  groupId: number;
  groupTitle: string;
  imported: number;
  skipped: number;
  replaced: number;
}

export const emptyArticle = (): Article => ({
  entry: {
    type: 'article',
    key: '',
    fields: {
      title: '',
      author: '',
      year: '',
    },
  },
  status: 'exists',
  source: '',
  location: '',
  caminho: '',
  notes: '',
  tags: [],
  factors: [],
  descartado: false,
  usado: false,
  revisaoLiteratura: false,
  pdfNaoEncontrado: false,
});
