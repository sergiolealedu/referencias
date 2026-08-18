/** Paleta de cores dos segmentos do dashboard — compartilhada entre o gráfico e a exportação. */
export const STACK_COLORS = {
  comFatores: '#a78bfa',
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

/**
 * Barra única do modo sem divisão por status. Neutra de propósito: reaproveitar
 * a cor de um segmento sugeriria que a barra é daquela categoria.
 */
export const TOTAL_COLOR = '#cbd5e1';

/** Ordem estável usada para atribuir um padrão de achurado a cada cor na exportação em P&B. */
export const CHART_COLOR_ORDER: string[] = [...Object.values(STACK_COLORS), TOTAL_COLOR];
