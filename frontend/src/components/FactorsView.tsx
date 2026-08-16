import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import { useFactorOverviews } from '../hooks/useApi';
import type { FactorOccurrence, FactorOverview } from '../types/referencias';
import {
  downloadFactorsExport,
  formatAllSpellings,
  parseFactorsExportFile,
} from '../utils/factors';

interface FactorsViewProps {
  onOpenArticle: (groupId: number, key: string) => void;
}

function polarityLabel(polarity: FactorOccurrence['polarity']): string {
  return polarity === 'positive' ? 'Positivo' : 'Negativo';
}

function occurrenceMeta(occurrence: FactorOccurrence): string {
  const parts = [
    occurrence.articleAuthor,
    occurrence.articleYear,
    occurrence.groupTitle,
  ].filter(Boolean);
  return parts.join(' · ');
}

export function FactorsView({ onOpenArticle }: FactorsViewProps) {
  const { data: factors = [], isLoading, error } = useFactorOverviews();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const [transferError, setTransferError] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = () => {
    setTransferError(false);
    if (factors.length === 0) {
      setTransferError(true);
      setTransferMessage('Nenhum fator para exportar.');
      return;
    }
    downloadFactorsExport(factors);
    setTransferMessage(`${factors.length} fator(es) exportado(s).`);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setTransferError(false);
    setTransferMessage(null);
    setImporting(true);
    try {
      const lista = parseFactorsExportFile(await file.text());
      const resultado = await api.importFactors(lista);
      // Recarrega o catálogo e as ocorrências já com os fatores novos.
      await queryClient.invalidateQueries({ queryKey: ['factors'] });
      const partes = [
        `${resultado.criados} criado(s)`,
        `${resultado.atualizados} atualizado(s)`,
      ];
      if (resultado.erros.length) partes.push(`${resultado.erros.length} com erro`);
      setTransferMessage(`Importação concluída: ${partes.join(', ')}.`);
      setTransferError(resultado.erros.length > 0);
    } catch (err) {
      setTransferError(true);
      setTransferMessage((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return factors;
    return factors.filter((factor) => {
      const spellings = [factor.name, ...factor.aliases].join(' ').toLowerCase();
      if (spellings.includes(q)) return true;
      return factor.occurrences.some(
        (occurrence) =>
          occurrence.label.toLowerCase().includes(q) ||
          occurrence.description.toLowerCase().includes(q) ||
          occurrence.articleTitle.toLowerCase().includes(q) ||
          occurrence.groupTitle.toLowerCase().includes(q),
      );
    });
  }, [factors, query]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((factor) => factor.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selected: FactorOverview | null =
    filtered.find((factor) => factor.id === selectedId) ?? null;

  const usedCount = factors.filter((factor) => factor.articleCount > 0).length;
  const unusedCount = factors.length - usedCount;

  return (
    <div className="factors-view">
      <div className="factors-view-toolbar">
        <div className="factors-view-toolbar-text">
          <h2>Fatores</h2>
          <p className="factors-view-subtitle">
            Lista consolidada dos fatores digitados nos artigos, com detalhes de cada
            ocorrência.
          </p>
        </div>
        <div className="factors-view-actions">
          <button type="button" onClick={handleExport} disabled={importing}>
            Exportar fatores
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            title="Importa um catálogo exportado; grafias novas são somadas aos fatores existentes"
          >
            {importing ? 'Importando…' : 'Importar fatores'}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            onChange={handleImportFile}
          />
        </div>
        <label className="factors-view-search">
          <span>Buscar</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome, grafia, artigo ou descrição"
          />
        </label>
      </div>

      {transferMessage && (
        <p className={transferError ? 'error' : 'hint'}>{transferMessage}</p>
      )}

      {isLoading && <p className="empty-state">Carregando fatores…</p>}
      {error && (
        <p className="error">
          Não foi possível carregar os fatores.
        </p>
      )}

      {!isLoading && !error && factors.length === 0 && (
        <p className="empty-state">
          Nenhum fator cadastrado ainda. Adicione fatores ao editar um artigo.
        </p>
      )}

      {!isLoading && !error && factors.length > 0 && (
        <>
          <div className="factors-view-summary" aria-live="polite">
            <span>
              {filtered.length === factors.length
                ? `${factors.length} fator(es)`
                : `${filtered.length} de ${factors.length} fator(es)`}
            </span>
            <span>{usedCount} com artigos</span>
            {unusedCount > 0 && <span>{unusedCount} sem uso</span>}
          </div>

          {filtered.length === 0 ? (
            <p className="empty-state">Nenhum fator corresponde à busca.</p>
          ) : (
            <div className="factors-view-layout">
              <aside className="factors-view-list" aria-label="Lista de fatores">
                <ul>
                  {filtered.map((factor) => {
                    const active = factor.id === selected?.id;
                    return (
                      <li key={factor.id}>
                        <button
                          type="button"
                          className={active ? 'is-active' : ''}
                          onClick={() => setSelectedId(factor.id)}
                          aria-current={active ? 'true' : undefined}
                        >
                          <span className="factors-view-list-name">{factor.name}</span>
                          <span className="factors-view-list-meta">
                            {factor.articleCount} artigo(s)
                            {factor.articleCount > 0 && (
                              <>
                                {' · '}
                                <span className="polarity-positive-text">
                                  +{factor.positiveCount}
                                </span>
                                {' / '}
                                <span className="polarity-negative-text">
                                  −{factor.negativeCount}
                                </span>
                              </>
                            )}
                          </span>
                          {factor.aliases.length > 0 && (
                            <span className="factors-view-list-aliases">
                              {factor.aliases.join(' · ')}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </aside>

              <section
                className="factors-view-detail"
                aria-label="Detalhes do fator"
              >
                {selected ? (
                  <>
                    <header className="factors-view-detail-header">
                      <h3>{selected.name}</h3>
                      <p className="factors-view-detail-spellings">
                        {formatAllSpellings(selected)}
                      </p>
                      <div className="factors-view-detail-stats">
                        <span>{selected.articleCount} ocorrência(s)</span>
                        <span className="factor-chip polarity-positive">
                          +{selected.positiveCount} positivo(s)
                        </span>
                        <span className="factor-chip polarity-negative">
                          −{selected.negativeCount} negativo(s)
                        </span>
                      </div>
                    </header>

                    {selected.occurrences.length === 0 ? (
                      <p className="empty-state">
                        Este fator está no catálogo, mas ainda não aparece em nenhum
                        artigo.
                      </p>
                    ) : (
                      <ul className="factors-view-occurrences">
                        {selected.occurrences.map((occurrence) => (
                          <li
                            key={`${occurrence.groupId}-${occurrence.articleKey}-${occurrence.polarity}-${occurrence.label}`}
                            className="factors-view-occurrence"
                          >
                            <div className="factors-view-occurrence-top">
                              <span
                                className={`factor-chip polarity-${occurrence.polarity}`}
                              >
                                {occurrence.polarity === 'positive' ? '+' : '−'}
                                {polarityLabel(occurrence.polarity)}
                              </span>
                              {occurrence.label !== selected.name && (
                                <span className="factors-view-occurrence-label">
                                  Grafia: {occurrence.label}
                                </span>
                              )}
                              {occurrence.usado && (
                                <span className="factors-view-badge">Usado</span>
                              )}
                              {occurrence.descartado && (
                                <span className="factors-view-badge is-muted">
                                  Descartado
                                </span>
                              )}
                              {occurrence.pdfNaoEncontrado && (
                                <span className="factors-view-badge is-muted">
                                  PDF n/enc.
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              className="factors-view-article-link"
                              onClick={() =>
                                onOpenArticle(
                                  occurrence.groupId,
                                  occurrence.articleKey,
                                )
                              }
                            >
                              {occurrence.articleTitle}
                            </button>

                            <p className="factors-view-occurrence-meta">
                              {occurrenceMeta(occurrence)}
                            </p>

                            {occurrence.description ? (
                              <p className="factors-view-occurrence-description">
                                {occurrence.description}
                              </p>
                            ) : (
                              <p className="factors-view-occurrence-description is-empty">
                                Sem descrição neste artigo.
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="empty-state">Selecione um fator para ver os detalhes.</p>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
