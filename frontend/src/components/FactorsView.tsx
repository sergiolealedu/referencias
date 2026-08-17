import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import { useFactorOverviews } from '../hooks/useApi';
import type { FactorOccurrence, FactorOverview } from '../types/referencias';
import {
  downloadFactorsExport,
  formatAllSpellings,
  parseFactorsDeltaFile,
  parseFactorsExportFile,
} from '../utils/factors';

interface FactorsViewProps {
  onOpenArticle: (groupId: number, key: string) => void;
  /** Fator a selecionar ao abrir a aba (clique num chip da lista de artigos). */
  focusFactorId?: string | null;
  onFocusConsumed?: () => void;
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

export function FactorsView({
  onOpenArticle,
  focusFactorId,
  onFocusConsumed,
}: FactorsViewProps) {
  const { data: factors = [], isLoading, error } = useFactorOverviews();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const deltaInputRef = useRef<HTMLInputElement>(null);
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

  const handleDeltaFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setTransferError(false);
    setTransferMessage(null);
    setImporting(true);
    try {
      const delta = parseFactorsDeltaFile(await file.text());
      const r = await api.applyFactorsDelta(delta);
      await queryClient.invalidateQueries({ queryKey: ['factors'] });
      await queryClient.invalidateQueries({ queryKey: ['articles'] });

      const partes = [`${r.aplicados} de ${r.recebidos} artigo(s) atualizado(s)`];
      if (r.fatoresAplicados) partes.push(`${r.fatoresAplicados} fator(es)`);
      if (r.fatoresCatalogo) partes.push(`${r.fatoresCatalogo} fator(es) do catálogo ajustado(s)`);
      if (r.naoEncontrados.length) {
        partes.push(
          `não encontrados: ${r.naoEncontrados.slice(0, 5).join(', ')}${r.naoEncontrados.length > 5 ? '…' : ''}`,
        );
      }
      if (r.fatoresNaoEncontrados?.length) {
        partes.push(
          `fatores não encontrados no catálogo: ${r.fatoresNaoEncontrados.slice(0, 5).join(', ')}${r.fatoresNaoEncontrados.length > 5 ? '…' : ''}`,
        );
      }
      if (r.ambiguos.length) {
        partes.push(
          `em mais de um grupo (informe groupId): ${r.ambiguos.map((a) => a.key).slice(0, 5).join(', ')}`,
        );
      }
      if (r.erros.length) partes.push(`${r.erros.length} com erro`);

      setTransferMessage(partes.join(' · '));
      setTransferError(
        r.naoEncontrados.length > 0 ||
          (r.fatoresNaoEncontrados?.length ?? 0) > 0 ||
          r.ambiguos.length > 0 ||
          r.erros.length > 0,
      );
    } catch (err) {
      setTransferError(true);
      setTransferMessage((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteFactor = async (factor: FactorOverview) => {
    const emUso = factor.articleCount;
    const aviso =
      emUso > 0
        ? `Excluir o fator "${factor.name}"?\n\nEle aparece em ${emUso} artigo(s) e essas ocorrências também serão removidas.`
        : `Excluir o fator "${factor.name}" do catálogo?`;
    if (!window.confirm(aviso)) return;

    setTransferError(false);
    setTransferMessage(null);
    setImporting(true);
    try {
      // Cascata só quando há ocorrências: sem ela o backend recusa com 409.
      const r = await api.deleteFactor(factor.id, emUso > 0);
      await queryClient.invalidateQueries({ queryKey: ['factors'] });
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
      setTransferMessage(
        r.ocorrenciasRemovidas > 0
          ? `Fator "${factor.name}" excluído · ${r.ocorrenciasRemovidas} ocorrência(s) removida(s).`
          : `Fator "${factor.name}" excluído.`,
      );
    } catch (err) {
      setTransferError(true);
      setTransferMessage((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleRemoveOccurrence = async (
    factor: FactorOverview,
    occurrence: FactorOccurrence,
  ) => {
    const aviso = `Remover o fator "${factor.name}" do artigo "${occurrence.articleTitle}"?\n\nO fator continua no catálogo.`;
    if (!window.confirm(aviso)) return;

    setTransferError(false);
    setTransferMessage(null);
    setImporting(true);
    try {
      await api.removeFactorFromArticle(
        factor.id,
        occurrence.groupId,
        occurrence.articleKey,
      );
      await queryClient.invalidateQueries({ queryKey: ['factors'] });
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
      setTransferMessage(
        `Fator removido de "${occurrence.articleKey}".`,
      );
    } catch (err) {
      setTransferError(true);
      setTransferMessage((err as Error).message);
    } finally {
      setImporting(false);
    }
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

  // Foco vindo de fora (chip na lista de artigos): espera o catálogo carregar,
  // limpa a busca para o fator aparecer na lista e o seleciona.
  useEffect(() => {
    if (!focusFactorId) return;
    if (!factors.some((factor) => factor.id === focusFactorId)) return;
    setQuery('');
    setSelectedId(focusFactorId);
    onFocusConsumed?.();
  }, [focusFactorId, factors, onFocusConsumed]);

  const activeItemRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const selected: FactorOverview | null =
    filtered.find((factor) => factor.id === selectedId) ?? null;

  const usedCount = factors.filter((factor) => factor.articleCount > 0).length;
  const unusedCount = factors.length - usedCount;

  return (
    <div className="factors-view">
      <div className="factors-view-toolbar">
        <div className="factors-view-toolbar-text">
          {/* Contadores na mesma linha do título: antes ocupavam uma faixa
              própria e o topo comia altura da lista. */}
          <h2>
            Fatores
            <span className="factors-view-counts" aria-live="polite">
              {filtered.length === factors.length
                ? `${factors.length} fator(es)`
                : `${filtered.length} de ${factors.length} fator(es)`}
              {' · '}
              {usedCount} com artigos
              {unusedCount > 0 ? ` · ${unusedCount} sem uso` : ''}
            </span>
          </h2>
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
          <button
            type="button"
            onClick={() => deltaInputRef.current?.click()}
            disabled={importing}
            title="Aplica um arquivo que liga fatores a artigos já existentes, pela chave BibTeX"
          >
            {importing ? 'Aplicando…' : 'Aplicar delta em artigos'}
          </button>
          <input
            ref={deltaInputRef}
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            onChange={handleDeltaFile}
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

          {filtered.length === 0 ? (
            <p className="empty-state">Nenhum fator corresponde à busca.</p>
          ) : (
            <div className="factors-view-layout">
              <aside className="factors-view-list" aria-label="Lista de fatores">
                <ul>
                  {filtered.map((factor) => {
                    const active = factor.id === selected?.id;
                    return (
                      <li key={factor.id} ref={active ? activeItemRef : undefined}>
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
                      <div className="factors-view-detail-title">
                        <h3>{selected.name}</h3>
                        <button
                          type="button"
                          className="danger factors-view-delete"
                          onClick={() => handleDeleteFactor(selected)}
                          disabled={importing}
                          title={
                            selected.articleCount > 0
                              ? `Exclui o fator e suas ${selected.articleCount} ocorrência(s)`
                              : 'Exclui o fator do catálogo'
                          }
                        >
                          Excluir fator
                        </button>
                      </div>
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
                              <button
                                type="button"
                                className="danger factors-view-occurrence-delete"
                                onClick={() =>
                                  handleRemoveOccurrence(selected, occurrence)
                                }
                                disabled={importing}
                                title="Remove o fator deste artigo; o catálogo continua igual"
                              >
                                Remover
                              </button>
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
