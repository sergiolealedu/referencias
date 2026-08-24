// As quatro funções de resolução de grafia vivem em `@sergiolealedu/referencias-shared`:
// backend e frontend precisam concordar sobre quando duas grafias são o mesmo
// fator, e enquanto estavam duplicadas nada garantia isso.
import {
  allFactorSpellings,
  findFactorBySpelling,
  normalizeFactorKey,
  tokenizeSpellings,
} from '@sergiolealedu/referencias-shared';

import type {
  ArticleFactor,
  FactorDefinition,
  FactorsDelta,
  FactorsDeltaCatalogOp,
  FactorsDeltaItem,
  FactorsExport,
} from '../types/referencias';

export { allFactorSpellings, findFactorBySpelling, normalizeFactorKey, tokenizeSpellings };

export function parseAliasesText(value: string): string[] {
  return tokenizeSpellings(value);
}

/** Todas as grafias/traduções do fator compartilhado no workspace. */
export function formatAllSpellings(factor: FactorDefinition): string {
  return allFactorSpellings(factor).join(', ');
}

export interface FactorSuggestion {
  factor: FactorDefinition;
  matchedSpelling: string;
}

export function suggestFactors(
  catalog: FactorDefinition[],
  query: string,
  limit = 12,
): FactorSuggestion[] {
  const q = normalizeFactorKey(query);
  const results: FactorSuggestion[] = [];

  for (const factor of catalog) {
    const spellings = allFactorSpellings(factor);
    let matched = spellings[0] ?? factor.name;
    if (q) {
      const hit = spellings.find((s) => normalizeFactorKey(s).includes(q));
      if (!hit) continue;
      matched = hit;
    }
    results.push({ factor, matchedSpelling: matched });
    if (results.length >= limit) break;
  }

  return results;
}

export interface FactorRowDraft {
  /** Chave local da linha na UI. */
  rowId: string;
  label: string;
  polarity: 'positive' | 'negative';
  description: string;
  factorId?: string;
  /** Grafias/traduções do workspace, separadas por vírgula. */
  aliasesText: string;
}

let rowSeq = 0;

export function newFactorRowId(): string {
  rowSeq += 1;
  return `factor-row-${rowSeq}-${Date.now()}`;
}

export function articleFactorsToDrafts(
  factors: ArticleFactor[] | undefined,
  catalog: FactorDefinition[],
): FactorRowDraft[] {
  if (!factors?.length) return [];
  return factors.map((factor) => {
    const def = catalog.find((f) => f.id === factor.factorId);
    return {
      rowId: newFactorRowId(),
      label: factor.label || def?.name || '',
      polarity: factor.polarity,
      description: factor.description,
      factorId: factor.factorId,
      aliasesText: def ? formatAllSpellings(def) : factor.label || '',
    };
  });
}

export function draftsToArticleFactorInputs(rows: FactorRowDraft[]) {
  return rows
    .filter((row) => row.label.trim())
    .map((row) => {
      const labelTokens = tokenizeSpellings(row.label);
      const label = labelTokens[0] ?? row.label.trim();
      return {
        factorId: row.factorId,
        label,
        polarity: row.polarity,
        description: row.description,
        aliases: tokenizeSpellings(row.aliasesText, ...labelTokens),
      };
    });
}

/** Baixa o catálogo de fatores para backup ou transferência entre workspaces. */
export function downloadFactorsExport(factors: FactorDefinition[]): void {
  const payload: FactorsExport = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    factors: factors.map((f) => ({
      id: f.id,
      name: f.name,
      aliases: [...f.aliases],
      category: f.category ?? null,
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `fatores-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Aceita o arquivo exportado ou uma lista solta de fatores. */
export function parseFactorsExportFile(text: string): FactorDefinition[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Arquivo não é um JSON válido.');
  }

  const lista = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as FactorsExport).factors)
      ? (data as FactorsExport).factors
      : null;

  if (!lista) {
    throw new Error('Arquivo inválido: esperado {"factors": [...]} ou uma lista de fatores.');
  }

  const fatores = lista
    .filter((f): f is FactorDefinition => Boolean(f) && typeof (f as FactorDefinition).name === 'string')
    .map((f) => ({
      id: typeof f.id === 'string' ? f.id : '',
      name: f.name.trim(),
      aliases: Array.isArray(f.aliases) ? f.aliases.filter((a) => typeof a === 'string') : [],
      category: typeof f.category === 'string' && f.category.trim() ? f.category.trim() : null,
    }))
    .filter((f) => f.name);

  if (fatores.length === 0) {
    throw new Error('Nenhum fator válido encontrado no arquivo.');
  }
  return fatores;
}

function textList(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : undefined;
}

/**
 * Aceita o delta como {"items": [...]} ou como lista solta. Cada item liga
 * fatores a um artigo que já existe, identificado pela chave BibTeX. Uma lista
 * "factors" no topo do arquivo traz operações de catálogo (renomear fator,
 * ajustar grafias), aplicadas antes dos artigos.
 */
export function parseFactorsDeltaFile(text: string): FactorsDelta {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Arquivo não é um JSON válido.');
  }

  const raiz =
    !Array.isArray(data) && data && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : null;

  const listaItems = Array.isArray(data)
    ? data
    : Array.isArray(raiz?.items)
      ? (raiz.items as unknown[])
      : [];
  const listaOps = Array.isArray(raiz?.factors) ? (raiz.factors as unknown[]) : [];

  const items: FactorsDeltaItem[] = [];
  for (const bruto of listaItems) {
    if (!bruto || typeof bruto !== 'object') continue;
    const item = bruto as Record<string, unknown>;
    const key = typeof item.key === 'string' ? item.key.trim() : '';
    const fatoresBrutos = Array.isArray(item.factors) ? item.factors : [];
    const removeFactors = (textList(item.removeFactors) ?? [])
      .map((v) => v.trim())
      .filter(Boolean);
    if (!key || (fatoresBrutos.length === 0 && removeFactors.length === 0)) continue;

    const factors = fatoresBrutos
      .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === 'object')
      .map((f) => ({
        label: typeof f.label === 'string' ? f.label.trim() : '',
        canonical: typeof f.canonical === 'string' ? f.canonical.trim() : undefined,
        polarity: f.polarity === 'negative' ? ('negative' as const) : ('positive' as const),
        description: typeof f.description === 'string' ? f.description : '',
        aliases: textList(f.aliases) ?? [],
        ...(typeof f.category === 'string' && f.category.trim()
          ? { category: f.category.trim() }
          : {}),
      }))
      .filter((f) => f.label);

    if (factors.length === 0 && removeFactors.length === 0) continue;
    items.push({
      key,
      ...(typeof item.groupId === 'number' ? { groupId: item.groupId } : {}),
      ...(factors.length > 0 ? { factors } : {}),
      ...(removeFactors.length > 0 ? { removeFactors } : {}),
    });
  }

  const factors: FactorsDeltaCatalogOp[] = listaOps
    .filter((op): op is Record<string, unknown> => Boolean(op) && typeof op === 'object')
    .map((op) => ({
      match: typeof op.match === 'string' ? op.match.trim() : '',
      ...(typeof op.name === 'string' && op.name.trim() ? { name: op.name.trim() } : {}),
      ...(textList(op.aliases) ? { aliases: textList(op.aliases) } : {}),
      ...(textList(op.spellings) ? { spellings: textList(op.spellings) } : {}),
      ...(typeof op.category === 'string' ? { category: op.category.trim() } : {}),
    }))
    .filter((op) => op.match);

  if (items.length === 0 && factors.length === 0) {
    throw new Error(
      'Nenhum item válido: inclua "items" (artigos, cada um com "key" e fatores com "label") ou "factors" (ajustes de catálogo com "match").',
    );
  }
  return { ...(factors.length > 0 ? { factors } : {}), items };
}

/** Fatores ainda não classificados caem neste grupo, sempre por último. */
export const SEM_CATEGORIA = 'Sem categoria';

export function categoriaDe(factor: { category?: string | null }): string {
  return factor.category?.trim() || SEM_CATEGORIA;
}

export type OrdemFatores = 'nome' | 'ocorrencias';

type Ordenavel = { name: string; articleCount: number };

/**
 * Por ocorrências, desempate pelo nome: sem isso a ordem entre fatores de mesma
 * contagem varia conforme a ordem de entrada e a lista "pisca" de lugar.
 */
export function compararFatores<T extends Ordenavel>(a: T, b: T, ordem: OrdemFatores): number {
  if (ordem === 'ocorrencias' && b.articleCount !== a.articleCount) {
    return b.articleCount - a.articleCount;
  }
  return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
}

/** Como a lista de fatores é dividida em seções. */
export type AgrupamentoFatores = 'categoria' | 'polaridade' | 'nenhum';

/**
 * Sinal com que o fator aparece nos artigos. `positiveCount + negativeCount`
 * é sempre igual a `articleCount` — cada ocorrência tem um sinal só — então as
 * quatro classes cobrem todo fator sem sobreposição.
 */
export type PolaridadeFator = 'positivos' | 'mistos' | 'negativos' | 'sem';

export const POLARIDADE_LABELS: Record<PolaridadeFator, string> = {
  positivos: 'Só positivos',
  mistos: 'Mistos',
  negativos: 'Só negativos',
  sem: 'Sem ocorrência',
};

/**
 * Ordem das seções por polaridade: é escala, não ranking. "Só positivos →
 * mistos → só negativos" se lê como um eixo, e reordenar por contagem
 * embaralharia esse eixo a cada mudança do corpus. "Sem ocorrência" fecha,
 * porque é pendência de análise e não um ponto da escala.
 */
export const POLARIDADES_EM_ORDEM: PolaridadeFator[] = [
  'positivos',
  'mistos',
  'negativos',
  'sem',
];

type ContagemPolaridade = { positiveCount: number; negativeCount: number };

export function polaridadeDe(factor: ContagemPolaridade): PolaridadeFator {
  const positivas = factor.positiveCount;
  const negativas = factor.negativeCount;
  if (positivas > 0 && negativas > 0) return 'mistos';
  if (positivas > 0) return 'positivos';
  if (negativas > 0) return 'negativos';
  return 'sem';
}

/** Distribui em baldes preservando a ordem de entrada dentro de cada um. */
function emBaldes<T>(itens: T[], chaveDe: (item: T) => string): Map<string, T[]> {
  const baldes = new Map<string, T[]>();
  for (const item of itens) {
    const chave = chaveDe(item);
    const lista = baldes.get(chave);
    if (lista) lista.push(item);
    else baldes.set(chave, [item]);
  }
  return baldes;
}

/**
 * Agrupa por categoria. "Sem categoria" fica por último em qualquer ordem — é
 * uma pendência de classificação, não um grupo que disputa posição. Entre os
 * demais, por ocorrências o grupo com mais artigos vem primeiro; senão,
 * alfabética pt-BR. A ordem dentro do grupo é a que já vem na entrada.
 */
export function agruparPorCategoria<T extends Ordenavel & { category?: string | null }>(
  fatores: T[],
  ordem: OrdemFatores,
): [string, T[]][] {
  const porCategoria = emBaldes(fatores, categoriaDe);
  const totalDe = (itens: T[]) => itens.reduce((soma, f) => soma + f.articleCount, 0);
  return [...porCategoria.entries()].sort(([a, itensA], [b, itensB]) => {
    if (a === SEM_CATEGORIA) return 1;
    if (b === SEM_CATEGORIA) return -1;
    if (ordem === 'ocorrencias') {
      const diferenca = totalDe(itensB) - totalDe(itensA);
      if (diferenca !== 0) return diferenca;
    }
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
  });
}

/**
 * Agrupa por polaridade, na ordem fixa da escala (ver `POLARIDADES_EM_ORDEM`) —
 * inclusive quando a ordenação escolhida é por ocorrências, que reordena os
 * fatores DENTRO de cada seção mas não as seções entre si.
 *
 * Seção sem nenhum fator não aparece: com filtro de busca ou de mínimo de
 * artigos, três cabeçalhos vazios só ocupariam a lista.
 */
export function agruparPorPolaridade<T extends Ordenavel & ContagemPolaridade>(
  fatores: T[],
): [string, T[]][] {
  const porPolaridade = emBaldes(fatores, (factor) => polaridadeDe(factor));
  return POLARIDADES_EM_ORDEM.filter((chave) => porPolaridade.has(chave)).map((chave) => [
    POLARIDADE_LABELS[chave],
    porPolaridade.get(chave)!,
  ]);
}
