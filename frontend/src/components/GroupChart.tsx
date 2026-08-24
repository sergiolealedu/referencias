/**
 * Os gráficos do dashboard. Saíram do `Dashboard.tsx`, que passava de mil
 * linhas: aqui fica o desenho, lá fica o estado da tela.
 */

import { useMemo, useRef, useState } from 'react';
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

import type { GroupArticleStats } from '../types/referencias';
import { STACK_COLORS, TOTAL_COLOR } from '../utils/chartColors';
import { copyChartPatternPngToClipboard, copyChartPngToClipboard } from '../utils/chartExport';
import {
  buildChartData,
  initialVisibility,
  segmentsForMode,
  sumSeries,
  USAGE_SEGMENTS,
  type ChartMode,
  type ChartPoint,
  type ChartSegment,
  type ViewMode,
} from '../utils/dashboardSeries';

const LABEL_FILL = '#1a2332';

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

export interface GroupChartProps {
  groupTitle: string;
  versao: string;
  series: GroupArticleStats['series'];
  extraMeta?: string;
  className?: string;
  expanded?: boolean;
  chartMode?: ChartMode;
  viewMode?: ViewMode;
  /** Falso: uma barra só por ano, somando os segmentos visíveis. */
  breakdown?: boolean;
  visibleSegments?: Record<ChartSegment, boolean>;
  onVisibleSegmentsChange?: (next: Record<ChartSegment, boolean>) => void;
  onToggleExpand?: () => void;
  /** No mobile, esconde meta/ações/legendas do card junto com o topo recolhível. */
  toolbarCollapsed?: boolean;
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

export function GroupChartContent({
  chartData,
  chartMode = 'usage',
  viewMode = 'year',
  breakdown = true,
  visibleSegments,
}: {
  chartData: ChartPoint[];
  chartMode?: ChartMode;
  viewMode?: ViewMode;
  breakdown?: boolean;
  visibleSegments: Record<ChartSegment, boolean>;
}) {
  const grouped = viewMode === 'total';
  const segments = segmentsForMode(chartMode);
  const visibleKeys = segments
    .filter((segment) => visibleSegments[segment.key])
    .map((segment) => segment.key);

  // Sem divisão por status, cada barra vale a soma dos segmentos ligados — os
  // botões de segmento seguem filtrando o que entra na conta.
  const dados = useMemo(
    () =>
      breakdown
        ? chartData
        : chartData.map((point) => ({
            ...point,
            visivel: visibleKeys.reduce((soma, key) => soma + point[key], 0),
          })),
    [chartData, breakdown, visibleKeys],
  );

  const yMax = useMemo(() => {
    if (visibleKeys.length === 0) return 1;
    if (!breakdown) {
      return Math.max(
        ...chartData.map((point) =>
          visibleKeys.reduce((sum, key) => sum + point[key], 0),
        ),
        1,
      );
    }
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
  }, [chartData, visibleKeys, grouped, breakdown]);

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
        data={dados}
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
        {!breakdown ? (
          <Bar
            dataKey="visivel"
            name="Artigos"
            fill={TOTAL_COLOR}
            minPointSize={4}
            radius={[4, 4, 0, 0]}
          >
            <LabelList dataKey="visivel" content={renderSegmentLabel} />
          </Bar>
        ) : chartMode === 'duplicates' ? (
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
            {visibleSegments.comFatores && (
              <Bar
                dataKey="comFatores"
                name="Com fator"
                stackId={stackId}
                fill={STACK_COLORS.comFatores}
                minPointSize={4}
                radius={barRadius('comFatores')}
              >
                <LabelList dataKey="comFatores" content={renderSegmentLabel} />
              </Bar>
            )}
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
            {visibleSegments.repetidos && (
              <Bar
                dataKey="repetidos"
                name="Repetidos"
                stackId={stackId}
                fill={STACK_COLORS.repetidos}
                minPointSize={4}
                radius={barRadius('repetidos')}
              >
                <LabelList dataKey="repetidos" content={renderSegmentLabel} />
              </Bar>
            )}
          </>
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GroupChart({
  groupTitle,
  versao,
  series,
  extraMeta,
  className = '',
  expanded = false,
  chartMode = 'usage',
  viewMode = 'year',
  breakdown = true,
  visibleSegments: visibleSegmentsProp,
  onVisibleSegmentsChange,
  onToggleExpand,
  toolbarCollapsed = false,
}: GroupChartProps) {
  const cardCollapsed = toolbarCollapsed && !expanded;
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

  /** Todas as categorias de uso somadas — cada artigo entra em exatamente uma. */
  const totalGeral = useMemo(
    () => USAGE_SEGMENTS.reduce((soma, segment) => soma + totals[segment.key], 0),
    [totals],
  );

  const chartData = useMemo(() => {
    if (viewMode === 'total') {
      if (series.length === 0) return [];
      return [
        {
          year: 'Total',
          ...totals,
          total:
            totals.comFatores +
            totals.usados +
            totals.comPdf +
            totals.naoEngSw +
            totals.naoDev +
            totals.naoQvt +
            totals.descartados +
            totals.outros +
            totals.repetidos,
        },
      ];
    }
    return buildChartData(series);
  }, [series, viewMode, totals]);

  // A legenda da tela é HTML fora do <svg>, então precisa ser reconstruída para
  // ser desenhada dentro da imagem exportada.
  /** Soma só do que está visível — esconder um segmento muda o total mostrado. */
  const totalVisivel = useMemo(
    () =>
      segmentsForMode(chartMode)
        .filter((segment) => visibleSegments[segment.key])
        .reduce((soma, segment) => soma + totals[segment.key], 0),
    [chartMode, visibleSegments, totals],
  );

  const legendItems = useMemo(() => {
    // Barra única: a legenda por categoria descreveria cores que não estão no
    // gráfico. Fica só o total.
    if (!breakdown) {
      return [{ label: `Total: ${totalVisivel}`, color: null }];
    }
    const itens = segmentsForMode(chartMode)
      .filter((segment) => visibleSegments[segment.key])
      .map((segment) => ({
        label: `${segment.label} (${totals[segment.key]})`,
        color: STACK_COLORS[segment.key],
      }));
    // Sem cor: entra na legenda como texto, sem quadradinho.
    return [...itens, { label: `Total: ${totalVisivel}`, color: null }];
  }, [chartMode, visibleSegments, totals, totalVisivel, breakdown]);

  const handleCopyPng = async () => {
    const container = chartContainerRef.current;
    if (!container) return;

    setCopyMessage(null);
    setCopying(true);
    try {
      await copyChartPngToClipboard(container, legendItems);
      setCopyMessage('PNG copiado para a área de transferência.');
    } catch (error) {
      setCopyMessage((error as Error).message);
    } finally {
      setCopying(false);
    }
  };

  const handleCopyPatternPng = async () => {
    const container = chartContainerRef.current;
    if (!container) return;

    setCopyMessage(null);
    setCopying(true);
    try {
      await copyChartPatternPngToClipboard(container, legendItems);
      setCopyMessage('PNG em preto e branco (com padrões) copiado para a área de transferência.');
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
      <header className={`dashboard-chart-header${cardCollapsed ? ' is-collapsed' : ''}`}>
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
              : `${totalGeral} artigos no gráfico · ${totals.comFatores} com fator · ${totals.usados} em uso · ${totals.comPdf} com PDF · ${totals.naoEngSw} não é eng. SW · ${totals.naoDev} não é dev · ${totals.naoQvt} não é QVT · ${totals.descartados} descartados · ${totals.outros} outros · ${totals.repetidos} repetidos`}
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
          {chartData.length > 0 && (
            <button
              type="button"
              className="dashboard-copy-btn dashboard-copy-pattern-btn"
              onClick={handleCopyPatternPng}
              disabled={copying}
              title="Gerar PNG em preto e branco (cada cor como um padrão de achurado) e copiar para a área de transferência"
            >
              {copying ? 'Copiando...' : 'Copiar P&B'}
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
        <p
          className={`dashboard-copy-message${copyMessage.includes('copiado') ? '' : ' error'}${cardCollapsed ? ' is-collapsed' : ''}`}
        >
          {copyMessage}
        </p>
      )}

      {chartData.length === 0 ? (
        <p className="dashboard-empty-chart">Nenhum artigo com ano informado neste grupo.</p>
      ) : (
        <>
          <div className={`dashboard-chart-segments-wrap${cardCollapsed ? ' is-collapsed' : ''}`}>
            <ChartSegmentToggles
              chartMode={chartMode}
              visibleSegments={visibleSegments}
              onToggle={toggleSegment}
            />
          </div>
          <div className="dashboard-chart-container" ref={chartContainerRef}>
            <GroupChartContent
              chartData={chartData}
              chartMode={chartMode}
              viewMode={viewMode}
              breakdown={breakdown}
              visibleSegments={visibleSegments}
            />
          </div>
        </>
      )}
    </section>
  );
}