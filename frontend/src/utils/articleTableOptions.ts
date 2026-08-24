import type { SortColumn } from '../types/referencias';

/**
 * Constantes da tabela de artigos, fora do arquivo do componente: exportar
 * valor ao lado de componente quebra o fast refresh do Vite — a edição do
 * componente recarrega a página inteira em vez de trocar só ele.
 */

export const PAGE_SIZE_OPTIONS = [20, 50] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

/**
 * Colunas realmente clicáveis — usado para descartar ordenação salva de uma
 * coluna que não existe mais (ex.: "tags", removida da tabela).
 */
export const SORTABLE_COLUMNS: readonly SortColumn[] = [
  'title',
  'author',
  'year',
  'status',
  'usado',
  'descartado',
  'pdfNaoEncontrado',
];
