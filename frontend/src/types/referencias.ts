/**
 * O contrato com a API vive em `@sergiolealedu/referencias-shared`.
 * Aqui ficam só os tipos que a SPA usa por conta própria.
 */
export * from '@sergiolealedu/referencias-shared';

// `export *` reexporta, mas não traz os nomes para o escopo deste arquivo — os
// tipos abaixo referenciam estes, então precisam ser importados também.
import type {
  Article,
  ArticleCategoria,
  FactorDefinition,
  FactorPolarity,
  MotivoDescarte,
  SortColumn,
  SortDirection,
} from '@sergiolealedu/referencias-shared';

export const ARTICLE_STATUSES = [
  'exists',
  'duplicate',
  'not_found',
  'gray',
  'manual_review',
  /** Não elegível para a revisão: não é artigo usável (anais, editorial, veículo reprovado). */
  'not_eligible',
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

export interface ArticleFactorInput {
  factorId?: string;
  label: string;
  polarity: FactorPolarity;
  description?: string;
  aliases?: string[];
}

export const MOTIVO_DESCARTE_LABELS: Record<MotivoDescarte, string> = {
  nao_eng_sw: 'Não é eng. de software',
  nao_dev: 'Não é desenvolvimento',
  nao_qvt: 'Não é QVT',
};

export interface GroupInput {
  title: string;
  versao?: string;
  mecanismo?: string;
  stringBusca?: string;
}

export const ARTICLE_CATEGORIA_LABELS: Record<ArticleCategoria, string> = {
  comFatores: 'Com fator',
  usados: 'Em uso',
  comPdf: 'Com PDF',
  naoEngSw: 'Não é eng. SW',
  naoDev: 'Não é dev',
  naoQvt: 'Não é QVT',
  descartados: 'Descartados',
  outros: 'Outros',
  repetidos: 'Repetidos',
};

/** Abstracts dos artigos NÃO usados de um grupo, para revisar exclusões. */

export interface AbstractsExport {
  group: { id: number; title: string; versao: string };
  articles: {
    key: string;
    title: string;
    year: string;
    abstract: string;
    status: string;
    descartado: boolean;
    motivoDescarte: MotivoDescarte | null;
    pdfNaoEncontrado: boolean;
    temPdf: boolean;
  }[];
}

/** Catálogo de fatores exportado, para backup ou transferir entre workspaces. */

export interface FactorsExport {
  formatVersion: 1;
  exportedAt: string;
  factors: FactorDefinition[];
}

export interface FactorsImportResult {
  recebidos: number;
  criados: number;
  atualizados: number;
  erros: { name: string; motivo: string }[];
}

/** Delta que liga fatores a artigos já existentes. */

export interface FactorsDeltaItem {
  key: string;
  groupId?: number;
  factors?: {
    factorId?: string;
    label: string;
    canonical?: string;
    polarity?: FactorPolarity;
    description?: string;
    aliases?: string[];
    /** Categoria temática do fator quando ele é novo no catálogo. */
    category?: string;
  }[];
  /** Fatores a desvincular do artigo, por qualquer grafia; roda antes de "factors". */
  removeFactors?: string[];
}

/**
 * Operação de catálogo dentro do delta: localiza o fator por qualquer grafia
 * (`match`) e renomeia (`name`), soma grafias (`aliases`) ou substitui o
 * conjunto inteiro (`spellings`).
 */

export interface FactorsDeltaCatalogOp {
  match: string;
  name?: string;
  aliases?: string[];
  spellings?: string[];
  /** Categoria temática; string vazia limpa. */
  category?: string;
}

export interface FactorsDelta {
  factors?: FactorsDeltaCatalogOp[];
  items: FactorsDeltaItem[];
}

export interface FactorsDeltaResult {
  recebidos: number;
  aplicados: number;
  fatoresAplicados: number;
  fatoresRemovidos?: number;
  fatoresCatalogo: number;
  naoEncontrados: string[];
  fatoresNaoEncontrados: string[];
  remocoesNaoEncontradas?: string[];
  ambiguos: { key: string; grupos: number[] }[];
  erros: { key: string; motivo: string }[];
}

/** Pacote para a IA analisar artigos e devolver um delta de fatores. */

export interface FactorsAnalysisExport {
  prompt: string;
  formatoResposta: unknown;
  aviso: string;
  baseUrl: string;
  escopo: string;
  resumo: { totalArtigos: number; semPdf: number; semAbstract: number };
  catalogo: { label: string; grafias: string[] }[];
  artigos: {
    chave: string;
    grupoId: number;
    grupo: string;
    titulo: string;
    ano: string;
    abstract: string;
    pdfUrl: string | null;
    pdfExpiraEm: string | null;
    fatoresAtuais: { label: string; polarity: FactorPolarity; description: string }[];
  }[];
}

export interface MarcarUsadosResult {
  solicitados: number;
  atualizados: number;
  naoEncontrados: string[];
}

export interface ArticleFilters {
  q?: string;
  tags?: string;
  status?: string;
  categoria?: ArticleCategoria;
  usado?: string;
  descartado?: string;
  revisaoLiteratura?: string;
  pdfNaoEncontrado?: string;
}

export interface ArticleListParams extends ArticleFilters {
  page?: number;
  pageSize?: number;
  sortBy?: SortColumn;
  sortDir?: SortDirection;
  findKey?: string;
}

export interface BibtexImportInput {
  bibtex: string;
  source: string;
  originArticle?: { groupId: number; key: string };
}

export interface AppSettings {
  sqliteDbPath: string;
  allowedPdfRoots: string[];
  activeWorkspaceId?: string;
  activeWorkspaceName?: string;
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
  motivoDescarte: null,
});
