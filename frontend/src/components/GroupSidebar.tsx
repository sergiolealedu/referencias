import { useEffect, useMemo, useState } from 'react';

import {
  useDeleteGroup,
  useGroups,
} from '../hooks/useApi';
import type { GroupSummary } from '../types/referencias';
import { collectVersoes, getLatestVersao } from '../utils/versao';
import { GroupFormModal } from './GroupFormModal';

interface GroupSidebarProps {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

export function GroupSidebar({ selectedId, onSelect }: GroupSidebarProps) {
  const { data: groups = [], isLoading, error } = useGroups();
  const deleteGroup = useDeleteGroup();
  const [versaoFilter, setVersaoFilter] = useState('');
  const [versaoFilterInitialized, setVersaoFilterInitialized] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingGroup, setEditingGroup] = useState<GroupSummary | null>(null);

  const availableVersoes = useMemo(() => collectVersoes(groups), [groups]);

  useEffect(() => {
    if (versaoFilterInitialized || availableVersoes.length === 0) return;
    setVersaoFilter(getLatestVersao(availableVersoes));
    setVersaoFilterInitialized(true);
  }, [availableVersoes, versaoFilterInitialized]);

  const filteredGroups = useMemo(() => {
    if (!versaoFilter) return groups;
    return groups.filter((g) => g.versao === versaoFilter);
  }, [groups, versaoFilter]);

  useEffect(() => {
    if (selectedId === null) return;
    if (!filteredGroups.some((g) => g.id === selectedId)) {
      onSelect(filteredGroups[0]?.id ?? null);
    }
  }, [filteredGroups, selectedId, onSelect]);

  const handleDelete = async (id: number, title: string) => {
    if (!window.confirm(`Excluir o grupo "${title}" e todos os seus artigos?`)) return;
    await deleteGroup.mutateAsync(id);
    if (selectedId === id) {
      const remaining = filteredGroups.filter((g) => g.id !== id);
      onSelect(remaining[0]?.id ?? null);
    }
  };

  const openCreate = () => {
    setEditingGroup(null);
    setFormMode('create');
  };

  const openEdit = (group: GroupSummary) => {
    setEditingGroup(group);
    setFormMode('edit');
  };

  const handleSaved = (groupId: number, versao: string) => {
    setVersaoFilterInitialized(true);
    setVersaoFilter(versao);
    onSelect(groupId);
  };

  if (isLoading) return <aside className="sidebar">Carregando grupos...</aside>;
  if (error) return <aside className="sidebar error">Erro: {(error as Error).message}</aside>;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Grupos</h2>
        <button type="button" onClick={openCreate}>
          + Novo
        </button>
      </div>
      {availableVersoes.length > 0 && (
        <label className="sidebar-filter">
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
              <option key={versao} value={versao}>{versao}</option>
            ))}
          </select>
        </label>
      )}
      <ul className="group-list">
        {filteredGroups.length === 0 ? (
          <li className="sidebar-empty">Nenhum grupo nesta versão.</li>
        ) : (
          filteredGroups.map((group) => (
            <li
              key={group.id}
              className={group.id === selectedId ? 'active' : ''}
            >
              <button
                type="button"
                className="group-item"
                onClick={() => onSelect(group.id)}
                title={
                  [group.title, group.mecanismo, group.stringBusca].filter(Boolean).join(' · ') ||
                  undefined
                }
              >
                <span className="group-title-wrap">
                  <span className="group-title">{group.title}</span>
                  {(group.mecanismo || group.stringBusca) && (
                    <span className="group-subtitle">
                      {[group.mecanismo, group.stringBusca].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="group-meta">
                  <span className="group-versao">{group.versao}</span>
                  <span className="group-count">{group.articleCount}</span>
                </span>
              </button>
              <div className="group-actions">
                <button type="button" onClick={() => openEdit(group)} title="Editar">✎</button>
                <button type="button" onClick={() => handleDelete(group.id, group.title)} title="Excluir">🗑</button>
              </div>
            </li>
          ))
        )}
      </ul>

      {formMode && (
        <GroupFormModal
          mode={formMode}
          group={editingGroup}
          onClose={() => setFormMode(null)}
          onSaved={handleSaved}
        />
      )}
    </aside>
  );
}
