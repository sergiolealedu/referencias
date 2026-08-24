/**
 * Tipos, segmentos e a matemática das séries do dashboard.
 *
 * Saíram do `Dashboard.tsx` (mil linhas) para cá porque são funções puras: aqui
 * dá para testá-las, e são elas que produzem os números que vão para a tese —
 * preenchimento de anos vazios, soma por grupo e consolidação entre grupos.
 */

import type { GroupArticleStats } from '../types/referencias';

export type ChartMode = 'usage' | 'duplicates';
export type ViewMode = 'year' | 'total';

export type UsageSegment =
  | 'comFatores'
  | 'usados'
  | 'comPdf'
  | 'naoEngSw'
  | 'naoDev'
  | 'naoQvt'
  | 'descartados'
  | 'outros'
  | 'repetidos';
export type DuplicateSegment = 'unicos' | 'repetidos';
export type ChartSegment = UsageSegment | DuplicateSegment;

// Ordem de empilhamento (base → topo): cada artigo entra em apenas um segmento,
// pela primeira condição que satisfizer.
export const USAGE_SEGMENTS: { key: UsageSegment; label: string }[] = [
  // Ter fator é a maior prioridade na classificação e o estado mais avançado
  // da análise, então abre o empilhamento.
  { key: 'comFatores', label: 'Com fator' },
  { key: 'usados', label: 'Em uso' },
  { key: 'comPdf', label: 'Com PDF' },
  { key: 'naoEngSw', label: 'Não é eng. SW' },
  { key: 'naoDev', label: 'Não é dev' },
  { key: 'naoQvt', label: 'Não é QVT' },
  { key: 'descartados', label: 'Descartados' },
  { key: 'outros', label: 'Outros' },
  // Repetido tem a maior prioridade na classificação, mas fica por último no
  // empilhamento para não deslocar a ordem já estabelecida das demais.
  { key: 'repetidos', label: 'Repetidos' },
];

export const DUPLICATE_SEGMENTS: { key: DuplicateSegment; label: string }[] = [
  { key: 'unicos', label: 'Únicos' },
  { key: 'repetidos', label: 'Repetidos' },
];

export function segmentsForMode(chartMode: ChartMode) {
  return chartMode === 'duplicates' ? DUPLICATE_SEGMENTS : USAGE_SEGMENTS;
}

export function initialVisibility(chartMode: ChartMode): Record<ChartSegment, boolean> {
  const segments = segmentsForMode(chartMode);
  return Object.fromEntries(segments.map((segment) => [segment.key, true])) as Record<
    ChartSegment,
    boolean
  >;
}

export type ChartPoint = {
  year: string;
  comFatores: number;
  usados: number;
  comPdf: number;
  naoEngSw: number;
  naoDev: number;
  naoQvt: number;
  descartados: number;
  outros: number;
  unicos: number;
  repetidos: number;
  total: number;
};

export function buildChartData(
  series: GroupArticleStats['series'],
): ChartPoint[] {
  if (series.length === 0) return [];

  const sorted = [...series].sort((a, b) => a.year - b.year);
  const minYear = sorted[0].year;
  const maxYear = sorted[sorted.length - 1].year;
  const span = maxYear - minYear;

  if (span > 15) {
    return sorted.map((point) => ({
      year: String(point.year),
      comFatores: point.comFatores,
      usados: point.usados,
      comPdf: point.comPdf,
      naoEngSw: point.naoEngSw,
      naoDev: point.naoDev,
      naoQvt: point.naoQvt,
      descartados: point.descartados,
      outros: point.outros,
      unicos: point.unicos,
      repetidos: point.repetidos,
      total:
        point.comFatores +
        point.usados +
        point.comPdf +
        point.naoEngSw +
        point.naoDev +
        point.naoQvt +
        point.descartados +
        point.outros +
        point.repetidos,
    }));
  }

  const byYear = new Map(sorted.map((point) => [point.year, point]));
  const filled: ChartPoint[] = [];

  for (let year = minYear; year <= maxYear; year += 1) {
    const point = byYear.get(year);
    filled.push({
      year: String(year),
      comFatores: point?.comFatores ?? 0,
      usados: point?.usados ?? 0,
      comPdf: point?.comPdf ?? 0,
      naoEngSw: point?.naoEngSw ?? 0,
      naoDev: point?.naoDev ?? 0,
      naoQvt: point?.naoQvt ?? 0,
      descartados: point?.descartados ?? 0,
      outros: point?.outros ?? 0,
      unicos: point?.unicos ?? 0,
      repetidos: point?.repetidos ?? 0,
      total:
        (point?.comFatores ?? 0) +
        (point?.usados ?? 0) +
        (point?.comPdf ?? 0) +
        (point?.naoEngSw ?? 0) +
        (point?.naoDev ?? 0) +
        (point?.naoQvt ?? 0) +
        (point?.descartados ?? 0) +
        (point?.outros ?? 0) +
        (point?.repetidos ?? 0),
    });
  }

  return filled;
}

export type SeriesTotals = Omit<GroupArticleStats['series'][number], 'year'>;

export const EMPTY_TOTALS: SeriesTotals = {
  comFatores: 0,
  usados: 0,
  comPdf: 0,
  naoEngSw: 0,
  naoDev: 0,
  naoQvt: 0,
  descartados: 0,
  outros: 0,
  unicos: 0,
  repetidos: 0,
};

export function sumSeries(series: GroupArticleStats['series']): SeriesTotals {
  return series.reduce(
    (acc, point) => ({
      comFatores: acc.comFatores + point.comFatores,
      usados: acc.usados + point.usados,
      comPdf: acc.comPdf + point.comPdf,
      naoEngSw: acc.naoEngSw + point.naoEngSw,
      naoDev: acc.naoDev + point.naoDev,
      naoQvt: acc.naoQvt + point.naoQvt,
      descartados: acc.descartados + point.descartados,
      outros: acc.outros + point.outros,
      unicos: acc.unicos + point.unicos,
      repetidos: acc.repetidos + point.repetidos,
    }),
    { ...EMPTY_TOTALS },
  );
}

export function buildConsolidatedSeries(
  stats: GroupArticleStats[],
): GroupArticleStats['series'] {
  const byYear = new Map<number, SeriesTotals>();

  for (const group of stats) {
    for (const point of group.series) {
      const existing = byYear.get(point.year) ?? { ...EMPTY_TOTALS };
      byYear.set(point.year, {
        comFatores: existing.comFatores + point.comFatores,
        usados: existing.usados + point.usados,
        comPdf: existing.comPdf + point.comPdf,
        naoEngSw: existing.naoEngSw + point.naoEngSw,
        naoDev: existing.naoDev + point.naoDev,
        naoQvt: existing.naoQvt + point.naoQvt,
        descartados: existing.descartados + point.descartados,
        outros: existing.outros + point.outros,
        unicos: existing.unicos + point.unicos,
        repetidos: existing.repetidos + point.repetidos,
      });
    }
  }

  return [...byYear.entries()]
    .sort(([yearA], [yearB]) => yearA - yearB)
    .map(([year, counts]) => ({ year, ...counts }));
}