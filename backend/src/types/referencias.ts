/**
 * O contrato compartilhado com a SPA vive em `@sergiolealedu/referencias-shared`.
 * Aqui ficam só os tipos que não atravessam a fronteira.
 */
export * from '@sergiolealedu/referencias-shared';

import type {
  Article,
  ArticleCategoria,
  GroupMeta,
  SortColumn,
  SortDirection,
} from '@sergiolealedu/referencias-shared';

/** @deprecated use GroupMeta — grupos não carregam mais artigos embutidos. */
export interface Group extends GroupMeta {
  articles: Article[];
}

/** Formato do JSON legado, lido só pelo script de migração. */
export interface ReferenciasData {
  groups: Group[];
}

/**
 * O que a API recebe DEPOIS de validar: `boolean` e `string[]` de verdade. O
 * frontend tem um `ArticleFilters` de mesmo nome com todos os campos `string`,
 * que é o que o `<select>` produz — a conversão entre os dois é o trabalho de
 * `schemas/articleList`, e unificar os tipos a esconderia.
 */
export interface ArticleFilters {
  q?: string;
  tags?: string[];
  status?: string;
  categoria?: ArticleCategoria;
  usado?: boolean;
  descartado?: boolean;
  revisaoLiteratura?: boolean;
  pdfNaoEncontrado?: boolean;
}

export interface ArticleListParams extends ArticleFilters {
  page?: number;
  pageSize?: number;
  sortBy?: SortColumn;
  sortDir?: SortDirection;
  findKey?: string;
}

export interface BibtexImportOptions {
  source: string;
  originArticle?: { groupId: number; key: string };
}
