import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useEnsureFactor, useUpdateFactor } from '../hooks/useApi';
import type { FactorDefinition } from '../types/referencias';
import {
  findFactorBySpelling,
  formatAllSpellings,
  newFactorRowId,
  suggestFactors,
  tokenizeSpellings,
  type FactorRowDraft,
} from '../utils/factors';

interface FactorsPanelProps {
  rows: FactorRowDraft[];
  catalog: FactorDefinition[];
  onChange: (rows: FactorRowDraft[]) => void;
}

function FactorNameInput({
  value,
  catalog,
  onChange,
  onSelectFactor,
  onBlurResolve,
}: {
  value: string;
  catalog: FactorDefinition[];
  onChange: (value: string) => void;
  onSelectFactor: (factor: FactorDefinition, spelling: string) => void;
  onBlurResolve: (label: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(
    () => suggestFactors(catalog, value),
    [catalog, value],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  return (
    <div className="factor-name-input" ref={wrapperRef}>
      <input
        list={listId}
        value={value}
        placeholder="Nome do fator (PT ou EN)"
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          onBlurResolve(value);
          window.setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % suggestions.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const selected = suggestions[activeIndex];
            if (selected) {
              onSelectFactor(selected.factor, selected.matchedSpelling);
              setOpen(false);
            }
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      <datalist id={listId}>
        {suggestions.map(({ factor, matchedSpelling }) => (
          <option
            key={`${factor.id}-${matchedSpelling}`}
            value={matchedSpelling}
            label={
              matchedSpelling === factor.name
                ? factor.name
                : `${matchedSpelling} → ${factor.name}`
            }
          />
        ))}
      </datalist>
      {open && suggestions.length > 0 && (
        <ul className="factor-suggestions" role="listbox">
          {suggestions.map((item, index) => {
            const spellings = formatAllSpellings(item.factor);
            return (
              <li key={item.factor.id}>
                <button
                  type="button"
                  className={index === activeIndex ? 'active' : ''}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelectFactor(item.factor, item.matchedSpelling);
                    setOpen(false);
                  }}
                >
                  <strong>{item.matchedSpelling}</strong>
                  <span>{spellings}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function FactorsPanel({ rows, catalog, onChange }: FactorsPanelProps) {
  const ensureFactor = useEnsureFactor();
  const updateFactor = useUpdateFactor();
  const [aliasesError, setAliasesError] = useState<string | null>(null);
  const dirtyAliasesRef = useRef(new Set<string>());
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    const current = rowsRef.current;
    let changed = false;
    const next = current.map((row) => {
      if (!row.factorId || dirtyAliasesRef.current.has(row.rowId)) return row;
      const def = catalog.find((factor) => factor.id === row.factorId);
      if (!def) return row;
      const shared = formatAllSpellings(def);
      if (shared === row.aliasesText) return row;
      changed = true;
      return { ...row, aliasesText: shared };
    });
    if (changed) onChange(next);
  }, [catalog, onChange]);

  const updateRow = (rowId: string, patch: Partial<FactorRowDraft>) => {
    onChange(rows.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  };

  const applySharedFactor = (
    rowId: string,
    factor: FactorDefinition,
    label: string,
  ) => {
    onChange(
      rows.map((row) =>
        row.rowId === rowId
          ? {
              ...row,
              label,
              factorId: factor.id,
              aliasesText: formatAllSpellings(factor),
            }
          : row.factorId === factor.id
            ? { ...row, aliasesText: formatAllSpellings(factor) }
            : row,
      ),
    );
  };

  const linkToWorkspaceCatalog = async (rowId: string, label: string) => {
    const labelTokens = tokenizeSpellings(label);
    const primaryLabel = labelTokens[0];
    if (!primaryLabel) {
      updateRow(rowId, { label, factorId: undefined });
      return;
    }

    const row = rows.find((item) => item.rowId === rowId);
    const aliases = tokenizeSpellings(row?.aliasesText, ...labelTokens);

    // Qualquer token (ex.: uma tradução) já existente identifica o mesmo fator.
    const localMatch =
      findFactorBySpelling(catalog, primaryLabel) ??
      aliases
        .map((token) => findFactorBySpelling(catalog, token))
        .find(Boolean);

    if (localMatch) {
      applySharedFactor(rowId, localMatch, primaryLabel);
    }

    try {
      const factor = await ensureFactor.mutateAsync({
        id: row?.factorId ?? localMatch?.id,
        name: primaryLabel,
        aliases,
      });
      applySharedFactor(rowId, factor, primaryLabel);
      setAliasesError(null);
    } catch (error) {
      setAliasesError((error as Error).message);
    }
  };

  const persistSharedSpellings = async (rowId: string, aliasesText: string) => {
    const row = rows.find((item) => item.rowId === rowId);
    if (!row) return;

    const spellings = tokenizeSpellings(aliasesText, row.label);
    if (spellings.length === 0) {
      dirtyAliasesRef.current.delete(rowId);
      return;
    }

    const primaryLabel =
      tokenizeSpellings(row.label)[0] ?? spellings[0] ?? row.label.trim();

    try {
      if (row.factorId) {
        const factor = await updateFactor.mutateAsync({
          id: row.factorId,
          spellings,
        });
        dirtyAliasesRef.current.delete(rowId);
        applySharedFactor(rowId, factor, primaryLabel || factor.name);
      } else if (primaryLabel) {
        const factor = await ensureFactor.mutateAsync({
          name: primaryLabel,
          aliases: spellings,
        });
        dirtyAliasesRef.current.delete(rowId);
        applySharedFactor(rowId, factor, primaryLabel);
      }
      setAliasesError(null);
    } catch (error) {
      setAliasesError((error as Error).message);
    }
  };

  const addRow = () => {
    onChange([
      ...rows,
      {
        rowId: newFactorRowId(),
        label: '',
        polarity: 'positive',
        description: '',
        aliasesText: '',
      },
    ]);
  };

  const removeRow = (rowId: string) => {
    onChange(rows.filter((row) => row.rowId !== rowId));
  };

  return (
    <section className="factors-panel" aria-label="Fatores do artigo">
      <div className="factors-panel-header">
        <div>
          <h3>Fatores</h3>
          <p>
            Catálogo compartilhado no workspace. Grafias e traduções separadas por
            vírgula — qualquer uma delas, se digitada como fator, representa o mesmo
            item analítico (<code>factorId</code>). Polaridade e descrição são deste
            artigo.
          </p>
        </div>
        <button type="button" className="secondary-btn" onClick={addRow}>
          Adicionar fator
        </button>
      </div>

      {aliasesError && <p className="factors-panel-error">{aliasesError}</p>}

      <div className="factors-panel-table-wrap">
        <table className="factors-table">
          <thead>
            <tr>
              <th className="factor-col-name">Fator</th>
              <th className="factor-col-polarity">Polaridade</th>
              <th className="factor-col-description">Descrição (artigo)</th>
              <th className="factor-col-aliases">Grafias / traduções (workspace)</th>
              <th className="factor-col-actions" aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="factors-empty">
                  Nenhum fator neste artigo. Informe o nome e as grafias separadas por
                  vírgula (ex.: usability, usabilidade). Qualquer token identifica o
                  mesmo fator no workspace.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.rowId}>
                  <td>
                    <FactorNameInput
                      value={row.label}
                      catalog={catalog}
                      onChange={(label) =>
                        updateRow(row.rowId, { label, factorId: undefined })
                      }
                      onSelectFactor={(factor, spelling) => {
                        applySharedFactor(row.rowId, factor, spelling);
                      }}
                      onBlurResolve={(label) => {
                        void linkToWorkspaceCatalog(row.rowId, label);
                      }}
                    />
                  </td>
                  <td>
                    <select
                      value={row.polarity}
                      onChange={(e) =>
                        updateRow(row.rowId, {
                          polarity: e.target.value as FactorRowDraft['polarity'],
                        })
                      }
                    >
                      <option value="positive">Positivo</option>
                      <option value="negative">Negativo</option>
                    </select>
                  </td>
                  <td>
                    <input
                      value={row.description}
                      onChange={(e) =>
                        updateRow(row.rowId, { description: e.target.value })
                      }
                      placeholder="Como o fator aparece neste artigo"
                    />
                  </td>
                  <td>
                    <input
                      value={row.aliasesText}
                      onChange={(e) => {
                        dirtyAliasesRef.current.add(row.rowId);
                        updateRow(row.rowId, { aliasesText: e.target.value });
                      }}
                      onBlur={(e) => {
                        void persistSharedSpellings(row.rowId, e.target.value);
                      }}
                      placeholder="usability, usabilidade, ease of use"
                      title="Grafias e traduções do workspace, separadas por vírgula"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="factor-remove-btn"
                      onClick={() => removeRow(row.rowId)}
                      title="Remover fator deste artigo"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
