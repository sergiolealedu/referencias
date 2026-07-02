import { useMemo, useState } from 'react';

import { useGroups, useStatusActivity } from '../hooks/useApi';
import type { DayStatusActivity } from '../types/referencias';
import { collectVersoes } from '../utils/versao';

type CalendarMode = 'month' | 'week';

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfWeekMonday(d: Date): Date {
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  return result;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

function monthRange(year: number, month: number) {
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function weekRange(anchor: Date) {
  const start = startOfWeekMonday(anchor);
  const end = addDays(start, 7);
  return { from: start.toISOString(), to: end.toISOString() };
}

function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
}

function formatWeekLabel(anchor: Date): string {
  const start = startOfWeekMonday(anchor);
  const end = addDays(start, 6);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('pt-BR', opts)} – ${end.toLocaleDateString('pt-BR', { ...opts, year: 'numeric' })}`;
}

function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const gridStart = startOfWeekMonday(first);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function buildWeekGrid(anchor: Date): Date[] {
  const start = startOfWeekMonday(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function activityMap(days: DayStatusActivity[]): Map<string, DayStatusActivity> {
  return new Map(days.map((day) => [day.date, day]));
}

function DayCell({
  date,
  activity,
  inPeriod,
  compact,
}: {
  date: Date;
  activity?: DayStatusActivity;
  inPeriod: boolean;
  compact?: boolean;
}) {
  const total = activity?.total ?? 0;
  const isToday = toDateKey(date) === toDateKey(new Date());

  return (
    <div
      className={[
        'activity-day',
        compact ? 'activity-day--compact' : '',
        inPeriod ? '' : 'activity-day--outside',
        isToday ? 'activity-day--today' : '',
        total > 0 ? 'activity-day--has-events' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="activity-day-number">{date.getDate()}</span>
      {total > 0 && (
        <div className="activity-day-counts">
          {(activity?.carregados ?? 0) > 0 && (
            <span className="activity-count activity-count--carregados" title="Carregados">
              {activity?.carregados}
            </span>
          )}
          {(activity?.usados ?? 0) > 0 && (
            <span className="activity-count activity-count--usados" title="Usados">
              {activity?.usados}
            </span>
          )}
          {(activity?.descartados ?? 0) > 0 && (
            <span className="activity-count activity-count--descartados" title="Descartados">
              {activity?.descartados}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function ActivityDashboard() {
  const { data: groups = [] } = useGroups();
  const versoes = useMemo(() => collectVersoes(groups), [groups]);
  const [versaoFilter, setVersaoFilter] = useState('');
  const [mode, setMode] = useState<CalendarMode>('month');
  const [anchor, setAnchor] = useState(() => new Date());

  const effectiveVersao = versaoFilter || undefined;
  const range = useMemo(
    () =>
      mode === 'month'
        ? monthRange(anchor.getFullYear(), anchor.getMonth())
        : weekRange(anchor),
    [mode, anchor],
  );

  const { data: activity = [], isLoading, error } = useStatusActivity({
    ...range,
    versao: effectiveVersao,
  });

  const byDate = useMemo(() => activityMap(activity), [activity]);

  const gridDates = useMemo(
    () =>
      mode === 'month'
        ? buildMonthGrid(anchor.getFullYear(), anchor.getMonth())
        : buildWeekGrid(anchor),
    [mode, anchor],
  );

  const periodTotals = useMemo(
    () =>
      activity.reduce(
        (acc, day) => ({
          carregados: acc.carregados + day.carregados,
          usados: acc.usados + day.usados,
          descartados: acc.descartados + day.descartados,
          total: acc.total + day.total,
        }),
        { carregados: 0, usados: 0, descartados: 0, total: 0 },
      ),
    [activity],
  );

  const navigate = (delta: number) => {
    setAnchor((current) => {
      if (mode === 'month') {
        return new Date(current.getFullYear(), current.getMonth() + delta, 1);
      }
      return addDays(current, delta * 7);
    });
  };

  const periodLabel =
    mode === 'month'
      ? formatMonthLabel(anchor.getFullYear(), anchor.getMonth())
      : formatWeekLabel(anchor);

  const isInPeriod = (date: Date) => {
    if (mode === 'week') return true;
    return date.getMonth() === anchor.getMonth() && date.getFullYear() === anchor.getFullYear();
  };

  return (
    <div className="dashboard activity-dashboard">
      <div className="dashboard-toolbar">
        <div className="dashboard-toolbar-text">
          <h2>Atividade de revisão</h2>
          <p className="dashboard-subtitle">
            Quantidade de artigos marcados como usados ou descartados por dia
          </p>
        </div>
        <div className="dashboard-toolbar-actions">
          <div className="activity-mode-toggle" role="group" aria-label="Modo do calendário">
            <button
              type="button"
              className={mode === 'month' ? 'active-view' : ''}
              onClick={() => setMode('month')}
            >
              Mensal
            </button>
            <button
              type="button"
              className={mode === 'week' ? 'active-view' : ''}
              onClick={() => setMode('week')}
            >
              Semanal
            </button>
          </div>
          {versoes.length > 0 && (
            <label className="dashboard-filter">
              Versão
              <select
                value={versaoFilter}
                onChange={(e) => setVersaoFilter(e.target.value)}
              >
                <option value="">Todas</option>
                {versoes.map((versao) => (
                  <option key={versao} value={versao}>
                    {versao}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="activity-nav">
        <button type="button" onClick={() => navigate(-1)} aria-label="Período anterior">
          ←
        </button>
        <h3 className="activity-period-label">{periodLabel}</h3>
        <button type="button" onClick={() => navigate(1)} aria-label="Próximo período">
          →
        </button>
        <button type="button" className="activity-today-btn" onClick={() => setAnchor(new Date())}>
          Hoje
        </button>
      </div>

      <div className="activity-legend">
        <span className="activity-legend-item">
          <span className="activity-legend-swatch activity-legend-swatch--carregados" />
          Carregados
        </span>
        <span className="activity-legend-item">
          <span className="activity-legend-swatch activity-legend-swatch--usados" />
          Usados
        </span>
        <span className="activity-legend-item">
          <span className="activity-legend-swatch activity-legend-swatch--descartados" />
          Descartados
        </span>
      </div>

      {isLoading && <p className="dashboard-status">Carregando atividade...</p>}
      {error && (
        <p className="error dashboard-status">Erro: {(error as Error).message}</p>
      )}

      {!isLoading && !error && (
        <>
          <div className="activity-summary">
            <span>
              <strong>{periodTotals.usados + periodTotals.descartados}</strong> mudanças de
              status no período
            </span>
            <span className="activity-summary-detail">
              {periodTotals.usados} usados · {periodTotals.descartados} descartados
              {periodTotals.carregados > 0 ? ` · ${periodTotals.carregados} carregados` : ''}
            </span>
          </div>

          <div className={`activity-calendar activity-calendar--${mode}`}>
            <div className="activity-weekdays">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label} className="activity-weekday">
                  {label}
                </span>
              ))}
            </div>
            <div className="activity-grid">
              {gridDates.map((date) => (
                <DayCell
                  key={toDateKey(date)}
                  date={date}
                  activity={byDate.get(toDateKey(date))}
                  inPeriod={isInPeriod(date)}
                  compact={mode === 'week'}
                />
              ))}
            </div>
          </div>

          {periodTotals.usados + periodTotals.descartados === 0 && (
            <p className="dashboard-status empty-state">
              Nenhum artigo marcado como usado ou descartado neste período
              {effectiveVersao ? ` (versão ${effectiveVersao})` : ''}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
