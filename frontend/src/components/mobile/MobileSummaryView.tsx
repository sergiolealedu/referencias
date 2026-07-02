import { useQuery } from '@tanstack/react-query';

import { api } from '../../api/dataProvider';

export function MobileSummaryView() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['mobile-stats'],
    queryFn: () => api.getMobileStats(),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: () => api.listGroups(),
  });

  if (isLoading) {
    return <p className="mobile-loading">Carregando resumo…</p>;
  }

  return (
    <div className="mobile-view mobile-summary">
      <h2>Resumo</h2>
      {stats && (
        <div className="mobile-stats-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">Total</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.usados}</span>
            <span className="stat-label">Usados</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.descartados}</span>
            <span className="stat-label">Descartados</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.pendentes}</span>
            <span className="stat-label">Pendentes</span>
          </div>
        </div>
      )}

      <h3>Grupos</h3>
      <ul className="mobile-group-list">
        {groups.map((g) => (
          <li key={g.id}>
            <span>{g.title}</span>
            <span className="mobile-group-count">{g.articleCount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
