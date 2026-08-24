import { useEffect, useMemo, useState } from 'react';

import { useArticleStatsByYear, useDetectDuplicates, useGroups } from '../hooks/useApi';
import { usePersistedState } from '../utils/persistedState';
import { collectVersoes, getLatestVersao } from '../utils/versao';
import {
  buildConsolidatedSeries,
  initialVisibility,
  type ChartMode,
  type ChartSegment,
  type ViewMode,
} from '../utils/dashboardSeries';
import { GroupChart } from './GroupChart';

export function Dashboard({ toolbarCollapsed = false }: { toolbarCollapsed?: boolean }) {
  const { data: groups = [] } = useGroups();
  const availableVersoes = useMemo(() => collectVersoes(groups), [groups]);
  const [versaoFilter, setVersaoFilter] = usePersistedState('dash.versao', '');
  // Já veio do localStorage? Então não sobrescrever com a versão mais recente.
  const [versaoFilterInitialized, setVersaoFilterInitialized] = useState(
    () => versaoFilter !== '',
  );
  const [expandedChart, setExpandedChart] = useState<'consolidated' | number | null>(null);
  const [viewMode, setViewMode] = usePersistedState<ViewMode>('dash.modo', () =>
    window.matchMedia('(max-width: 900px)').matches ? 'total' : 'year',
  );
  const [breakdown, setBreakdown] = usePersistedState<boolean>('dash.porStatus', true);
  const [chartVisibility, setChartVisibility] = usePersistedState<
    Record<string, Record<ChartSegment, boolean>>
  >('dash.segmentos', {});

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
  }, [availableVersoes, versaoFilterInitialized, setVersaoFilter]);

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
      <div className={`dashboard-toolbar${toolbarCollapsed ? ' is-collapsed' : ''}`}>
        <div className="dashboard-toolbar-content">
          <div className="dashboard-toolbar-text">
            <h2>Dashboard por grupo</h2>
            <p className="dashboard-subtitle">
              "Todos" soma os grupos. Os botões de categoria filtram nos dois modos.
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
          <div className="dashboard-view-toggle" role="group" aria-label="Divisão das barras">
            <button
              type="button"
              className={`dashboard-view-toggle-btn${breakdown ? ' is-active' : ''}`}
              aria-pressed={breakdown}
              onClick={() => setBreakdown(true)}
              title="Cada barra empilha as categorias"
            >
              Por status
            </button>
            <button
              type="button"
              className={`dashboard-view-toggle-btn${!breakdown ? ' is-active' : ''}`}
              aria-pressed={!breakdown}
              onClick={() => setBreakdown(false)}
              title="Uma barra por ano, somando as categorias ligadas"
            >
              Sem divisão
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
            breakdown={breakdown}
            visibleSegments={getChartVisibility('consolidated', 'usage')}
            onVisibleSegmentsChange={(next) => setChartVisibilityFor('consolidated', next)}
            onToggleExpand={() => setExpandedChart('consolidated')}
            toolbarCollapsed={toolbarCollapsed}
          />

          {stats.map((group) => (
            <GroupChart
              key={group.groupId}
              groupTitle={group.groupTitle}
              versao={group.versao}
              series={group.series}
              viewMode={viewMode}
              breakdown={breakdown}
              visibleSegments={getChartVisibility(`group-${group.groupId}`, 'usage')}
              onVisibleSegmentsChange={(next) =>
                setChartVisibilityFor(`group-${group.groupId}`, next)
              }
              onToggleExpand={() => setExpandedChart(group.groupId)}
              toolbarCollapsed={toolbarCollapsed}
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
            breakdown={breakdown}
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
            breakdown={breakdown}
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
