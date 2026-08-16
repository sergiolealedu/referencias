import type {
  ArticleFactor,
  FactorDefinition,
  FactorsDelta,
  FactorsDeltaCatalogOp,
  FactorsDeltaItem,
  FactorsExport,
} from '../types/referencias';

/** Normaliza grafia para comparação case-insensitive e sem acentos. */
export function normalizeFactorKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Separa grafias por vírgula (aceita `;` legado), remove vazios e
 * deduplica de forma case-insensitive. Cada token é uma grafia independente
 * que, se digitada como fator, aponta para o mesmo item analítico.
 */
export function tokenizeSpellings(...values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value) continue;
    for (const part of value.split(/[,;]+/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const key = normalizeFactorKey(trimmed);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(trimmed);
    }
  }

  return result;
}

export function allFactorSpellings(factor: FactorDefinition): string[] {
  return tokenizeSpellings(factor.name, ...factor.aliases);
}

export function findFactorBySpelling(
  factors: FactorDefinition[],
  spelling: string,
): FactorDefinition | undefined {
  const tokens = tokenizeSpellings(spelling);
  if (tokens.length === 0) return undefined;

  // Qualquer token digitado como fator deve resolver o mesmo item.
  for (const token of tokens) {
    const key = normalizeFactorKey(token);
    const match = factors.find((factor) =>
      allFactorSpellings(factor).some((s) => normalizeFactorKey(s) === key),
    );
    if (match) return match;
  }
  return undefined;
}

/** Grafias digitadas no campo, separadas por vírgula. */
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
    factors: factors.map((f) => ({ id: f.id, name: f.name, aliases: [...f.aliases] })),
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
    if (!key || fatoresBrutos.length === 0) continue;

    const factors = fatoresBrutos
      .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === 'object')
      .map((f) => ({
        label: typeof f.label === 'string' ? f.label.trim() : '',
        canonical: typeof f.canonical === 'string' ? f.canonical.trim() : undefined,
        polarity: f.polarity === 'negative' ? ('negative' as const) : ('positive' as const),
        description: typeof f.description === 'string' ? f.description : '',
        aliases: textList(f.aliases) ?? [],
      }))
      .filter((f) => f.label);

    if (factors.length === 0) continue;
    items.push({
      key,
      ...(typeof item.groupId === 'number' ? { groupId: item.groupId } : {}),
      factors,
    });
  }

  const factors: FactorsDeltaCatalogOp[] = listaOps
    .filter((op): op is Record<string, unknown> => Boolean(op) && typeof op === 'object')
    .map((op) => ({
      match: typeof op.match === 'string' ? op.match.trim() : '',
      ...(typeof op.name === 'string' && op.name.trim() ? { name: op.name.trim() } : {}),
      ...(textList(op.aliases) ? { aliases: textList(op.aliases) } : {}),
      ...(textList(op.spellings) ? { spellings: textList(op.spellings) } : {}),
    }))
    .filter((op) => op.match);

  if (items.length === 0 && factors.length === 0) {
    throw new Error(
      'Nenhum item válido: inclua "items" (artigos, cada um com "key" e fatores com "label") ou "factors" (ajustes de catálogo com "match").',
    );
  }
  return { ...(factors.length > 0 ? { factors } : {}), items };
}
