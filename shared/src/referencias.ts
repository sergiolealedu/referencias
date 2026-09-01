/**
 * Contrato de dados entre a API e a SPA.
 *
 * Estes tipos existiam em duplicata nos dois workspaces — 29 declarações
 * idênticas mantidas à mão em dois arquivos. Mudar um campo num lado e esquecer
 * o outro não dava erro de compilação em lugar nenhum: aparecia como campo
 * `undefined` em runtime.
 *
 * NÃO entram aqui `ArticleFilters` e `ArticleListParams`: apesar do nome igual,
 * são tipos diferentes. No backend os campos são `boolean`/`string[]` (o que a
 * API recebe depois de validar); no frontend são `string` (o que o `<select>`
 * produz). Unificá-los esconderia a conversão, que é justamente o trabalho de
 * `schemas/articleList`.
 */

export interface DuplicateRef {
  groupId: number;
  key: string;
}

export interface Entry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

export type FactorPolarity = 'positive' | 'negative';

/** Fator canônico do workspace, com múltiplas grafias (PT/EN). */

export interface FactorDefinition {
  id: string;
  name: string;
  aliases: string[];
  /** Categoria temática (ex.: Individual, Técnico, Organizacional). */
  category?: string | null;
  /**
   * O que o fator significa, em linguagem de quem trabalha na indústria — não a
   * evidência de um artigo. É `ArticleFactor.description` que guarda o achado de
   * cada artigo; esta é a definição do fator, uma só, válida para todos eles.
   */
  description?: string | null;
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
  category?: string | null;
  description?: string | null;
  articleCount: number;
  positiveCount: number;
  negativeCount: number;
  occurrences: FactorOccurrence[];
}

export const MOTIVOS_DESCARTE = ['nao_eng_sw', 'nao_dev', 'nao_qvt'] as const;

export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number];

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
  motivoDescarte: MotivoDescarte | null;
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

export interface GroupSummary {
  id: number;
  title: string;
  versao: string;
  mecanismo: string;
  stringBusca: string;
  createdAt: string;
  articleCount: number;
}

export const ARTICLE_CATEGORIAS = [
  'comFatores',
  'usados',
  'comPdf',
  'naoEngSw',
  'naoDev',
  'naoQvt',
  'descartados',
  'outros',
  'repetidos',
] as const;

export type ArticleCategoria = (typeof ARTICLE_CATEGORIAS)[number];

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

export interface YearArticleStats {
  year: number;
  comFatores: number;
  usados: number;
  comPdf: number;
  naoEngSw: number;
  naoDev: number;
  naoQvt: number;
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
