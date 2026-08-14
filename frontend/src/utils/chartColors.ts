/** Paleta de cores dos segmentos do dashboard — compartilhada entre o gráfico e a exportação. */
export const STACK_COLORS = {
  usados: '#6ee7b7',
  comPdf: '#7dd3fc',
  naoEngSw: '#fdba74',
  naoDev: '#fb923c',
  naoQvt: '#f97316',
  descartados: '#fda4af',
  outros: '#fde68a',
  unicos: '#93c5fd',
  repetidos: '#e9a8fd',
} as const;

/** Ordem estável usada para atribuir um padrão de achurado a cada cor na exportação em P&B. */
export const CHART_COLOR_ORDER: string[] = Object.values(STACK_COLORS);
