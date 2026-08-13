import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LabelProps } from 'recharts';

import { useArticleStatsByYear, useDetectDuplicates, useGroups } from '../hooks/useApi';
import type { GroupArticleStats } from '../types/referencias';
import { copyChartPngToClipboard } from '../utils/chartExport';
import { collectVersoes, getLatestVersao } from '../utils/versao';

const STACK_COLORS = {
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

const LABEL_FILL = '#1a2332';

type ChartMode = 'usage' | 'duplicates';
type ViewMode = 'year' | 'total';

type UsageSegment =
  | 'usados'
  | 'comPdf'
  | 'naoEngSw'
  | 'naoDev'
  | 'naoQvt'
  | 'descartados'
  | 'outros';
type DuplicateSegment = 'unicos' | 'repetidos';
type ChartSegment = UsageSegment | DuplicateSegment;

// Ordem de empilhamento (base → topo): cada artigo entra em apenas um segmento,
// pela primeira condição que satisfizer.
const USAGE_SEGMENTS: { key: UsageSegment; label: string }[] = [
  { key: 'usados', label: 'Em uso' },
  { key: 'comPdf', label: 'Com PDF' },
  { key: 'naoEngSw', label: 'Não é eng. SW' },
  { key: 'naoDev', label: 'Não é dev' },
  { key: 'naoQvt', label: 'Não é QVT' },
  { key: 'descartados', label: 'Descartados' },
  { key: 'outros', label: 'Outros' },
];

const DUPLICATE_SEGMENTS: { key: DuplicateSegment; label: string }[] = [
  { key: 'unicos', label: 'Únicos' },
  { key: 'repetidos', label: 'Repetidos' },
];

function segmentsForMode(chartMode: ChartMode) {
  return chartMode === 'duplicates' ? DUPLICATE_SEGMENTS : USAGE_SEGMENTS;
}

function initialVisibility(chartMode: ChartMode): Record<ChartSegment, boolean> {
  const segments = segmentsForMode(chartMode);
  return Object.fromEntries(segments.map((segment) => [segment.key, true])) as Record<
    ChartSegment,
    boolean
  >;
}

type ChartPoint = {
  year: string;
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

function renderSegmentLabel(props: LabelProps, insideFill = LABEL_FILL) {
  const value = Number(props.value ?? 0);
  if (!value) return null;

  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const centerX = x + width / 2;

  if (height >= 16) {
    return (
      <text
        x={centerX}
        y={y + height / 2}
        fill={insideFill}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
      >
        {value}
      </text>
    );
  }

  return (
    <text
      x={centerX}
      y={y - 4}
      fill="#1a2332"
      textAnchor="middle"
      dominantBaseline="auto"
      fontSize={11}
      fontWeight={600}
    >
      {value}
    </text>
  );
}

function buildChartData(
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
        point.usados +
        point.comPdf +
        point.naoEngSw +
        point.naoDev +
        point.naoQvt +
        point.descartados +
        point.outros,
    }));
  }

  const byYear = new Map(sorted.map((point) => [point.year, point]));
  const filled: ChartPoint[] = [];

  for (let year = minYear; year <= maxYear; year += 1) {
    const point = byYear.get(year);
    filled.push({
      year: String(year),
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
        (point?.usados ?? 0) +
        (point?.comPdf ?? 0) +
        (point?.naoEngSw ?? 0) +
        (point?.naoDev ?? 0) +
        (point?.naoQvt ?? 0) +
        (point?.descartados ?? 0) +
        (point?.outros ?? 0),
    });
  }

  return filled;
}

type SeriesTotals = Omit<GroupArticleStats['series'][number], 'year'>;

const EMPTY_TOTALS: SeriesTotals = {
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

function sumSeries(series: GroupArticleStats['series']): SeriesTotals {
  return series.reduce(
    (acc, point) => ({
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

function buildConsolidatedSeries(
  stats: GroupArticleStats[],
): GroupArticleStats['series'] {
  const byYear = new Map<number, SeriesTotals>();

  for (const group of stats) {
    for (const point of group.series) {
      const existing = byYear.get(point.year) ?? { ...EMPTY_TOTALS };
      byYear.set(point.year, {
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

interface GroupChartProps {
  groupTitle: string;
  versao: string;
  series: GroupArticleStats['series'];
  extraMeta?: string;
  className?: string;
  expanded?: boolean;
  chartMode?: ChartMode;
  viewMode?: ViewMode;
  visibleSegments?: Record<ChartSegment, boolean>;
  onVisibleSegmentsChange?: (next: Record<ChartSegment, boolean>) => void;
  onToggleExpand?: () => void;
}

function ChartSegmentToggles({
  chartMode,
  visibleSegments,
  onToggle,
}: {
  chartMode: ChartMode;
  visibleSegments: Record<ChartSegment, boolean>;
  onToggle: (key: ChartSegment) => void;
}) {
  const segments = segmentsForMode(chartMode);

  return (
    <div className="dashboard-chart-segments" role="group" aria-label="Status visíveis">
      {segments.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={`dashboard-segment-toggle${visibleSegments[key] ? ' is-active' : ''}`}
          onClick={() => onToggle(key)}
          aria-pressed={visibleSegments[key]}
        >
          <span
            className="dashboard-segment-swatch"
            style={{ background: STACK_COLORS[key] }}
            aria-hidden="true"
          />
          {label}
        </button>
      ))}
    </div>
  );
}

function GroupChartContent({
  chartData,
  chartMode = 'usage',
  viewMode = 'year',
  visibleSegments,
}: {
  chartData: ChartPoint[];
  chartMode?: ChartMode;
  viewMode?: ViewMode;
  visibleSegments: Record<ChartSegment, boolean>;
}) {
  const grouped = viewMode === 'total';
  const segments = segmentsForMode(chartMode);
  const visibleKeys = segments
    .filter((segment) => visibleSegments[segment.key])
    .map((segment) => segment.key);

  const yMax = useMemo(() => {
    if (visibleKeys.length === 0) return 1;
    if (grouped) {
      return Math.max(
        ...chartData.flatMap((point) => visibleKeys.map((key) => point[key])),
        1,
      );
    }
    return Math.max(
      ...chartData.map((point) =>
        visibleKeys.reduce((sum, key) => sum + point[key], 0),
      ),
      1,
    );
  }, [chartData, visibleKeys, grouped]);

  const topSegment = visibleKeys[visibleKeys.length - 1];
  const stackId = grouped ? undefined : 'articles';
  const barRadius = (key: ChartSegment) =>
    (grouped || topSegment === key ? [4, 4, 0, 0] : undefined) as
      | [number, number, number, number]
      | undefined;

  const barSize = chartData.length <= 2
    ? 72
    : chartData.length <= 6
      ? 48
      : chartData.length <= 12
        ? 32
        : undefined;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        margin={{ top: 16, right: 24, left: 8, bottom: 8 }}
        barCategoryGap="18%"
        barSize={barSize}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="year"
          tick={{ fontSize: 12 }}
          interval={0}
          angle={chartData.length > 12 ? -35 : 0}
          textAnchor={chartData.length > 12 ? 'end' : 'middle'}
          height={chartData.length > 12 ? 56 : 32}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12 }}
          width={40}
          domain={[0, Math.max(yMax, 1)]}
        />
        <Tooltip
          labelFormatter={(label) => (viewMode === 'total' ? `${label}` : `Ano ${label}`)}
          formatter={(value, name) => [value ?? 0, name ?? '']}
        />
        {chartMode === 'duplicates' ? (
          <>
            {visibleSegments.unicos && (
              <Bar
                dataKey="unicos"
                name="Únicos"
                stackId="articles"
                fill={STACK_COLORS.unicos}
                minPointSize={4}
                radius={topSegment === 'unicos' ? [4, 4, 0, 0] : undefined}
              >
                <LabelList dataKey="unicos" content={renderSegmentLabel} />
              </Bar>
            )}
            {visibleSegments.repetidos && (
              <Bar
                dataKey="repetidos"
                name="Repetidos"
                stackId="articles"
                fill={STACK_COLORS.repetidos}
                minPointSize={4}
                radius={topSegment === 'repetidos' ? [4, 4, 0, 0] : undefined}
              >
                <LabelList dataKey="repetidos" content={renderSegmentLabel} />
              </Bar>
            )}
          </>
        ) : (
          <>
            {visibleSegments.usados && (
              <Bar
                dataKey="usados"
                name="Em uso"
                stackId={stackId}
                fill={STACK_COLORS.usados}
                minPointSize={4}
                radius={barRadius('usados')}
              >
                <LabelList dataKey="usados" content={renderSegmentLabel} />
              </Bar>
            )}
            {visibleSegments.comPdf && (
              <Bar
                dataKey="comPdf"
                name="Com PDF"
                stackId={stackId}
                fill={STACK_COLORS.comPdf}
                minPointSize={4}
                radius={barRadius('comPdf')}
              >
                <LabelList dataKey="comPdf" content={renderSegmentLabel} />
              </Bar>
            )}
            {visibleSegments.naoEngSw && (
              <Bar
                dataKey="naoEngSw"
                name="Não é eng. SW"
                stackId={stackId}
                fill={STACK_COLORS.naoEngSw}
                minPointSize={4}
                radius={barRadius('naoEngSw')}
              >
                <LabelList dataKey="naoEngSw" content={renderSegmentLabel} />
              </Bar>
            )}
            {visibleSegments.naoDev && (
              <Bar
                dataKey="naoDev"
                name="Não é dev"
                stackId={stackId}
                fill={STACK_COLORS.naoDev}
                minPointSize={4}
                radius={barRadius('naoDev')}
              >
                <LabelList dataKey="naoDev" content={renderSegmentLabel} />
              </Bar>
            )}
            {visibleSegments.naoQvt && (
              <Bar
                dataKey="naoQvt"
                name="Não é QVT"
                stackId={stackId}
                fill={STACK_COLORS.naoQvt}
                minPointSize={4}
                radius={barRadius('naoQvt')}
              >
                <LabelList dataKey="naoQvt" content={renderSegmentLabel} />
              </Bar>
            )}
            {visibleSegments.descartados && (
              <Bar
                dataKey="descartados"
                name="Descartados"
                stackId={stackId}
                fill={STACK_COLORS.descartados}
                minPointSize={4}
                radius={barRadius('descartados')}
              >
                <LabelList dataKey="descartados" content={renderSegmentLabel} />
              </Bar>
            )}
            {visibleSegments.outros && (
              <Bar
                dataKey="outros"
                name="Outros"
                stackId={stackId}
                fill={STACK_COLORS.outros}
                minPointSize={4}
                radius={barRadius('outros')}
              >
                <LabelList dataKey="outros" content={renderSegmentLabel} />
              </Bar>
            )}
          </>
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

function GroupChart({
  groupTitle,
  versao,
  series,
  extraMeta,
  className = '',
  expanded = false,
  chartMode = 'usage',
  viewMode = 'year',
  visibleSegments: visibleSegmentsProp,
  onVisibleSegmentsChange,
  onToggleExpand,
}: GroupChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [localVisible, setLocalVisible] = useState(() => initialVisibility(chartMode));
  const visibleSegments = visibleSegmentsProp ?? localVisible;

  const setVisibleSegments = (next: Record<ChartSegment, boolean>) => {
    if (onVisibleSegmentsChange) {
      onVisibleSegmentsChange(next);
    } else {
      setLocalVisible(next);
    }
  };

  const toggleSegment = (key: ChartSegment) => {
    const next = { ...visibleSegments, [key]: !visibleSegments[key] };
    const activeCount = segmentsForMode(chartMode).filter((segment) => next[segment.key]).length;
    if (activeCount === 0) return;
    setVisibleSegments(next);
  };

  const totals = useMemo(() => sumSeries(series), [series]);

  const chartData = useMemo(() => {
    if (viewMode === 'total') {
      if (series.length === 0) return [];
      return [
        {
          year: 'Total',
          ...totals,
          total:
            totals.usados +
            totals.comPdf +
            totals.naoEngSw +
            totals.naoDev +
            totals.naoQvt +
            totals.descartados +
            totals.outros,
        },
      ];
    }
    return buildChartData(series);
  }, [series, viewMode, totals]);

  const handleCopyPng = async () => {
    const container = chartContainerRef.current;
    if (!container) return;

    setCopyMessage(null);
    setCopying(true);
    try {
      await copyChartPngToClipboard(container);
      setCopyMessage('PNG copiado para a área de transferência.');
    } catch (error) {
      setCopyMessage((error as Error).message);
    } finally {
      setCopying(false);
    }
  };

  return (
    <section
      className={`dashboard-chart-card${expanded ? ' dashboard-chart-card--expanded' : ''}${className ? ` ${className}` : ''}`}
    >
      <header className="dashboard-chart-header">
        <div>
          <h3>{groupTitle}</h3>
          <p className="dashboard-chart-meta">
            <span className="panel-group-versao">{versao}</span>
            {extraMeta && (
              <>
                {' · '}
                {extraMeta}
              </>
            )}
            {' · '}
            {chartMode === 'duplicates'
              ? `${totals.unicos} únicos · ${totals.repetidos} repetidos`
              : `${totals.usados} em uso · ${totals.comPdf} com PDF · ${totals.naoEngSw} não é eng. SW · ${totals.naoDev} não é dev · ${totals.naoQvt} não é QVT · ${totals.descartados} descartados · ${totals.outros} outros`}
          </p>
        </div>
        <div className="dashboard-chart-actions">
          {chartData.length > 0 && (
            <button
              type="button"
              className="dashboard-copy-btn"
              onClick={handleCopyPng}
              disabled={copying}
              title="Gerar PNG do gráfico e copiar para a área de transferência"
            >
              {copying ? 'Copiando...' : 'Copiar PNG'}
            </button>
          )}
          {onToggleExpand && (
            <button
              type="button"
              className="dashboard-expand-btn"
              onClick={onToggleExpand}
              title={expanded ? 'Sair da tela cheia' : 'Tela cheia'}
            >
              {expanded ? 'Sair da tela cheia' : 'Tela cheia'}
            </button>
          )}
        </div>
      </header>
      {copyMessage && (
        <p className={`dashboard-copy-message${copyMessage.includes('copiado') ? '' : ' error'}`}>
          {copyMessage}
        </p>
      )}

      {chartData.length === 0 ? (
        <p className="dashboard-empty-chart">Nenhum artigo com ano informado neste grupo.</p>
      ) : (
        <>
          <ChartSegmentToggles
            chartMode={chartMode}
            visibleSegments={visibleSegments}
            onToggle={toggleSegment}
          />
          <div className="dashboard-chart-container" ref={chartContainerRef}>
            <GroupChartContent
              chartData={chartData}
              chartMode={chartMode}
              viewMode={viewMode}
              visibleSegments={visibleSegments}
            />
          </div>
        </>
      )}
    </section>
  );
}

export function Dashboard() {
  const { data: groups = [] } = useGroups();
  const availableVersoes = useMemo(() => collectVersoes(groups), [groups]);
  const [versaoFilter, setVersaoFilter] = useState('');
  const [versaoFilterInitialized, setVersaoFilterInitialized] = useState(false);
  const [expandedChart, setExpandedChart] = useState<'consolidated' | number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    window.matchMedia('(max-width: 900px)').matches ? 'total' : 'year',
  );
  const [chartVisibility, setChartVisibility] = useState<
    Record<string, Record<ChartSegment, boolean>>
  >({});

  const getChartVisibility = (chartId: string, chartMode: ChartMode) =>
    chartVisibility[chartId] ?? initialVisibility(chartMode);

  const setChartVisibilityFor = (
    chartId: string,
    next: Record<ChartSegment, boolean>,
  ) => {
    setChartVisibility((prev) => ({ ...prev, [chartId]: next }));
  };

  useEffect(() => {
    if (versaoFilterInitialized || availableVersoes.length === 0) return;
    setVersaoFilter(getLatestVersao(availableVersoes));
    setVersaoFilterInitialized(true);
  }, [availableVersoes, versaoFilterInitialized]);

  useEffect(() => {
    if (expandedChart === null) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedChart(null);
    };

    document.body.classList.add('dashboard-fullscreen-open');
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('dashboard-fullscreen-open');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expandedChart]);

  const queryVersao = versaoFilter || undefined;
  const { data: stats = [], isLoading, error } = useArticleStatsByYear(queryVersao);
  const detectDuplicates = useDetectDuplicates();

  const consolidatedSeries = useMemo(
    () => buildConsolidatedSeries(stats),
    [stats],
  );

  const expandedGroup = typeof expandedChart === 'number'
    ? stats.find((group) => group.groupId === expandedChart)
    : null;

  return (
    <div className="dashboard">
      <div className="dashboard-toolbar">
        <div className="dashboard-toolbar-text">
          <h2>Dashboard por grupo</h2>
          <p className="dashboard-subtitle">
            Barras empilhadas por ano, ou lado a lado no modo Consolidado. "Todos" soma todos os grupos.
          </p>
        </div>
        <div className="dashboard-toolbar-actions">
          <button
            type="button"
            className="dashboard-detect-btn"
            disabled={detectDuplicates.isPending}
            onClick={() => detectDuplicates.mutate(versaoFilter || 'v2')}
            title="Identifica artigos repetidos entre grupos da versão selecionada"
          >
            {detectDuplicates.isPending ? 'Detectando...' : 'Detectar repetidos'}
          </button>
          {detectDuplicates.data && (
            <span className="dashboard-detect-result">
              {detectDuplicates.data.marked} marcados · {detectDuplicates.data.cleared} desmarcados
            </span>
          )}
          {detectDuplicates.error && (
            <span className="error dashboard-detect-result">
              {(detectDuplicates.error as Error).message}
            </span>
          )}
        </div>
        <div className="dashboard-view-toggle" role="group" aria-label="Modo de visualização">
          <button
            type="button"
            className={`dashboard-view-toggle-btn${viewMode === 'year' ? ' is-active' : ''}`}
            aria-pressed={viewMode === 'year'}
            onClick={() => setViewMode('year')}
          >
            Por ano
          </button>
          <button
            type="button"
            className={`dashboard-view-toggle-btn${viewMode === 'total' ? ' is-active' : ''}`}
            aria-pressed={viewMode === 'total'}
            onClick={() => setViewMode('total')}
          >
            Consolidado
          </button>
        </div>
        {availableVersoes.length > 0 && (
          <label className="dashboard-filter">
            Versão
            <select
              value={versaoFilter}
              onChange={(e) => {
                setVersaoFilterInitialized(true);
                setVersaoFilter(e.target.value);
              }}
            >
              <option value="">Todas</option>
              {availableVersoes.map((versao) => (
                <option key={versao} value={versao}>
                  {versao}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {isLoading && <p className="dashboard-status">Carregando estatísticas...</p>}
      {error && (
        <p className="error dashboard-status">Erro: {(error as Error).message}</p>
      )}

      {!isLoading && !error && stats.length === 0 && (
        <p className="dashboard-status empty-state">
          Nenhum grupo encontrado{versaoFilter ? ` na versão ${versaoFilter}` : ''}.
        </p>
      )}

      {!isLoading && !error && stats.length > 0 && (
        <div className="dashboard-stack">
          <GroupChart
            key="consolidated"
            className="dashboard-chart-card--consolidated"
            groupTitle="Todos"
            versao={versaoFilter || 'Todas'}
            extraMeta={`${stats.length} ${stats.length === 1 ? 'grupo' : 'grupos'}`}
            series={consolidatedSeries}
            viewMode={viewMode}
            visibleSegments={getChartVisibility('consolidated', 'usage')}
            onVisibleSegmentsChange={(next) => setChartVisibilityFor('consolidated', next)}
            onToggleExpand={() => setExpandedChart('consolidated')}
          />

          {stats.map((group) => (
            <GroupChart
              key={group.groupId}
              groupTitle={group.groupTitle}
              versao={group.versao}
              series={group.series}
              viewMode={viewMode}
              visibleSegments={getChartVisibility(`group-${group.groupId}`, 'usage')}
              onVisibleSegmentsChange={(next) =>
                setChartVisibilityFor(`group-${group.groupId}`, next)
              }
              onToggleExpand={() => setExpandedChart(group.groupId)}
            />
          ))}
        </div>
      )}

      {expandedChart === 'consolidated' && (
        <div
          className="dashboard-fullscreen"
          role="dialog"
          aria-modal="true"
          aria-label="Gráfico Todos"
        >
          <GroupChart
            className="dashboard-chart-card--consolidated"
            groupTitle="Todos"
            versao={versaoFilter || 'Todas'}
            extraMeta={`${stats.length} ${stats.length === 1 ? 'grupo' : 'grupos'}`}
            series={consolidatedSeries}
            viewMode={viewMode}
            visibleSegments={getChartVisibility('consolidated', 'usage')}
            onVisibleSegmentsChange={(next) => setChartVisibilityFor('consolidated', next)}
            expanded
            onToggleExpand={() => setExpandedChart(null)}
          />
        </div>
      )}

      {expandedGroup && (
        <div
          className="dashboard-fullscreen"
          role="dialog"
          aria-modal="true"
          aria-label={`Gráfico ${expandedGroup.groupTitle}`}
        >
          <GroupChart
            groupTitle={expandedGroup.groupTitle}
            versao={expandedGroup.versao}
            series={expandedGroup.series}
            viewMode={viewMode}
            visibleSegments={getChartVisibility(`group-${expandedGroup.groupId}`, 'usage')}
            onVisibleSegmentsChange={(next) =>
              setChartVisibilityFor(`group-${expandedGroup.groupId}`, next)
            }
            expanded
            onToggleExpand={() => setExpandedChart(null)}
          />
        </div>
      )}
    </div>
  );
}
