import type { ArticleFactor, FactorDefinition } from '../types/referencias';

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
