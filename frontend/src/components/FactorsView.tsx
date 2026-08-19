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
  /**
   * No mobile a tela é mestre-detalhe: ou a lista, ou o detalhe. No desktop os
   * dois painéis convivem e esta flag não muda nada — quem esconde um ou outro
   * é o CSS, dentro do @media, para o desktop nunca depender do estado mobile.
   */
  const [detailOpen, setDetailOpen] = useState(false);
  const [editandoFator, setEditandoFator] = useState(false);
  const [nomeDraft, setNomeDraft] = useState('');
  const [grafiasDraft, setGrafiasDraft] = useState('');
  /** Ocorrência em edição, identificada por grupo+chave do artigo. */
  const [ocorrenciaEmEdicao, setOcorrenciaEmEdicao] = useState<string | null>(null);
  const [ocorrenciaDraft, setOcorrenciaDraft] = useState({
    label: '',
    polarity: 'positive' as FactorOccurrence['polarity'],
    description: '',
  });
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
      if (r.fatoresRemovidos) partes.push(`${r.fatoresRemovidos} ocorrência(s) removida(s)`);
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
      if (r.remocoesNaoEncontradas?.length) {
        partes.push(
          `remoções sem correspondência: ${r.remocoesNaoEncontradas.slice(0, 5).join(', ')}${r.remocoesNaoEncontradas.length > 5 ? '…' : ''}`,
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

  const abrirEdicaoFator = (factor: FactorOverview) => {
    setTransferMessage(null);
    setNomeDraft(factor.name);
    setGrafiasDraft(formatAllSpellings(factor));
    setEditandoFator(true);
  };

  const salvarFator = async (factor: FactorOverview) => {
    const nome = nomeDraft.trim();
    if (!nome) {
      setTransferError(true);
      setTransferMessage('O nome do fator não pode ficar vazio.');
      return;
    }
    if (/[,;]/.test(nome)) {
      setTransferError(true);
      setTransferMessage('O nome não pode conter vírgula nem ponto-e-vírgula: são separadores de grafia.');
      return;
    }

    setTransferError(false);
    setTransferMessage(null);
    setImporting(true);
    try {
      // O nome vai também na lista de grafias: sem ele ali, o backend elegeria a
      // primeira grafia como nome e a renomeação seria descartada em silêncio.
      const grafias = [nome, ...grafiasDraft.split(/[,;]/)]
        .map((g) => g.trim())
        .filter(Boolean);
      await api.updateFactor(factor.id, { name: nome, spellings: grafias });
      await queryClient.invalidateQueries({ queryKey: ['factors'] });
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
      setEditandoFator(false);
      setTransferMessage(`Fator salvo como "${nome}".`);
    } catch (err) {
      setTransferError(true);
      setTransferMessage((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const abrirEdicaoOcorrencia = (occurrence: FactorOccurrence) => {
    setTransferMessage(null);
    setOcorrenciaEmEdicao(`${occurrence.groupId}-${occurrence.articleKey}`);
    setOcorrenciaDraft({
      label: occurrence.label,
      polarity: occurrence.polarity,
      description: occurrence.description,
    });
  };

  const salvarOcorrencia = async (
    factor: FactorOverview,
    occurrence: FactorOccurrence,
  ) => {
    const label = ocorrenciaDraft.label.trim();
    if (!label) {
      setTransferError(true);
      setTransferMessage('A grafia do artigo não pode ficar vazia.');
      return;
    }

    setTransferError(false);
    setTransferMessage(null);
    setImporting(true);
    try {
      await api.updateFactorOccurrence(factor.id, occurrence.groupId, occurrence.articleKey, {
        label,
        polarity: ocorrenciaDraft.polarity,
        description: ocorrenciaDraft.description,
      });
      await queryClient.invalidateQueries({ queryKey: ['factors'] });
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
      setOcorrenciaEmEdicao(null);
      setTransferMessage(`Ocorrência de "${occurrence.articleKey}" salva.`);
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
      // O fator aberto deixou de existir: no mobile volta para a lista.
      setDetailOpen(false);
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
    // Vindo de um chip na lista de artigos, o alvo é o detalhe daquele fator.
    setDetailOpen(true);
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
            <div
              className={`factors-view-layout${detailOpen ? ' is-detail-open' : ''}`}
            >
              <aside className="factors-view-list" aria-label="Lista de fatores">
                <ul>
                  {filtered.map((factor) => {
                    const active = factor.id === selected?.id;
                    return (
                      <li key={factor.id} ref={active ? activeItemRef : undefined}>
                        <button
                          type="button"
                          className={active ? 'is-active' : ''}
                          onClick={() => {
                            setSelectedId(factor.id);
                            setDetailOpen(true);
                          }}
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
                        {/* Só aparece no mobile, onde a lista dá lugar ao
                            detalhe; no desktop os dois ficam lado a lado. */}
                        <button
                          type="button"
                          className="factors-view-back"
                          onClick={() => setDetailOpen(false)}
                        >
                          ← Fatores
                        </button>
                        <h3>{selected.name}</h3>
                        <button
                          type="button"
                          className="factors-view-edit"
                          onClick={() =>
                            editandoFator
                              ? setEditandoFator(false)
                              : abrirEdicaoFator(selected)
                          }
                          disabled={importing}
                          aria-expanded={editandoFator}
                          title="Renomeia o fator e edita suas grafias no catálogo"
                        >
                          {editandoFator ? 'Cancelar' : 'Editar'}
                        </button>
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
                      {editandoFator ? (
                        <form
                          className="factors-view-edit-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void salvarFator(selected);
                          }}
                        >
                          <label>
                            <span>Nome no catálogo</span>
                            <input
                              value={nomeDraft}
                              onChange={(e) => setNomeDraft(e.target.value)}
                              autoFocus
                            />
                          </label>
                          <label>
                            <span>Grafias (separadas por vírgula)</span>
                            <input
                              value={grafiasDraft}
                              onChange={(e) => setGrafiasDraft(e.target.value)}
                            />
                          </label>
                          <p className="factors-view-edit-hint">
                            Estas grafias são como o app reconhece o fator ao aplicar
                            um delta. Tirar uma daqui não altera os artigos.
                          </p>
                          <div className="factors-view-edit-actions">
                            <button type="submit" className="primary" disabled={importing}>
                              {importing ? 'Salvando…' : 'Salvar'}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <p className="factors-view-detail-spellings">
                          {formatAllSpellings(selected)}
                        </p>
                      )}
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
                        {selected.occurrences.map((occurrence) => {
                          const emEdicao =
                            ocorrenciaEmEdicao ===
                            `${occurrence.groupId}-${occurrence.articleKey}`;
                          return (
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
                                className="factors-view-occurrence-edit"
                                onClick={() =>
                                  emEdicao
                                    ? setOcorrenciaEmEdicao(null)
                                    : abrirEdicaoOcorrencia(occurrence)
                                }
                                disabled={importing}
                                aria-expanded={emEdicao}
                                title="Edita polaridade, grafia e descrição neste artigo"
                              >
                                {emEdicao ? 'Cancelar' : 'Editar'}
                              </button>
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

                            {emEdicao ? (
                              <form
                                className="factors-view-edit-form"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void salvarOcorrencia(selected, occurrence);
                                }}
                              >
                                <label>
                                  <span>Polaridade</span>
                                  <select
                                    value={ocorrenciaDraft.polarity}
                                    onChange={(e) =>
                                      setOcorrenciaDraft((d) => ({
                                        ...d,
                                        polarity: e.target
                                          .value as FactorOccurrence['polarity'],
                                      }))
                                    }
                                  >
                                    <option value="positive">Positivo</option>
                                    <option value="negative">Negativo</option>
                                  </select>
                                </label>
                                <label>
                                  <span>Grafia neste artigo (verbatim)</span>
                                  <input
                                    value={ocorrenciaDraft.label}
                                    onChange={(e) =>
                                      setOcorrenciaDraft((d) => ({ ...d, label: e.target.value }))
                                    }
                                  />
                                </label>
                                <label>
                                  <span>Descrição</span>
                                  <textarea
                                    rows={4}
                                    value={ocorrenciaDraft.description}
                                    onChange={(e) =>
                                      setOcorrenciaDraft((d) => ({
                                        ...d,
                                        description: e.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <p className="factors-view-edit-hint">
                                  A grafia nova entra como sinônimo do fator; a antiga
                                  continua no catálogo até ser removida em "Editar" no
                                  cabeçalho.
                                </p>
                                <div className="factors-view-edit-actions">
                                  <button type="submit" className="primary" disabled={importing}>
                                    {importing ? 'Salvando…' : 'Salvar'}
                                  </button>
                                </div>
                              </form>
                            ) : occurrence.description ? (
                              <p className="factors-view-occurrence-description">
                                {occurrence.description}
                              </p>
                            ) : (
                              <p className="factors-view-occurrence-description is-empty">
                                Sem descrição neste artigo.
                              </p>
                            )}
                          </li>
                          );
                        })}
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
