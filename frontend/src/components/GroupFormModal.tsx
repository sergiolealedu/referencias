import { useEffect, useState } from 'react';

import { useCreateGroup, useUpdateGroup } from '../hooks/useApi';
import type { GroupInput, GroupSummary } from '../types/referencias';

interface GroupFormModalProps {
  mode: 'create' | 'edit';
  group?: GroupSummary | null;
  onClose: () => void;
  onSaved: (groupId: number, versao: string) => void;
}

const emptyForm = (): GroupInput => ({
  title: '',
  versao: 'v2',
  mecanismo: 'Scopus',
  stringBusca: '',
});

export function GroupFormModal({
  mode,
  group,
  onClose,
  onSaved,
}: GroupFormModalProps) {
  const [form, setForm] = useState<GroupInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const isSaving = createGroup.isPending || updateGroup.isPending;

  useEffect(() => {
    if (mode === 'edit' && group) {
      setForm({
        title: group.title,
        versao: group.versao,
        mecanismo: group.mecanismo,
        stringBusca: group.stringBusca,
      });
    } else {
      setForm(emptyForm());
    }
    setError(null);
  }, [mode, group]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError('O título é obrigatório.');
      return;
    }
    setError(null);
    try {
      const payload: GroupInput = {
        title: form.title.trim(),
        versao: form.versao?.trim() || 'v2',
        mecanismo: form.mecanismo?.trim() || 'Scopus',
        stringBusca: form.stringBusca ?? '',
      };
      if (mode === 'create') {
        const created = await createGroup.mutateAsync(payload);
        onSaved(created.id, created.versao);
      } else if (group) {
        await updateGroup.mutateAsync({ id: group.id, ...payload });
        onSaved(group.id, payload.versao ?? group.versao);
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal group-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{mode === 'create' ? 'Novo grupo' : 'Editar grupo'}</h3>
          <button type="button" className="form-close" onClick={onClose} title="Fechar">
            ×
          </button>
        </div>

        <div className="modal-body">
          <label>
            Título
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            />
          </label>

          <label>
            Versão
            <input
              value={form.versao ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, versao: e.target.value }))}
            />
          </label>

          <label>
            Mecanismo
            <input
              value={form.mecanismo ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, mecanismo: e.target.value }))}
              placeholder="Scopus"
            />
          </label>

          <label>
            String de busca
            <textarea
              rows={3}
              value={form.stringBusca ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, stringBusca: e.target.value }))}
              placeholder="Consulta utilizada para obter as referências"
            />
          </label>

          {error && <p className="error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
