import { randomUUID } from 'node:crypto';

import type { ArticleFactor, FactorDefinition, FactorPolarity } from '../types/referencias.js';

export interface ArticleFactorInput {
  factorId?: string;
  label: string;
  polarity: FactorPolarity;
  description?: string;
  /** Grafias adicionais (PT/EN) a associar ao fator canônico. */
  aliases?: string[];
}

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

  for (const token of tokens) {
    const key = normalizeFactorKey(token);
    const match = factors.find((factor) =>
      allFactorSpellings(factor).some((s) => normalizeFactorKey(s) === key),
    );
    if (match) return match;
  }
  return undefined;
}

export function mergeAliases(factor: FactorDefinition, extras: string[]): FactorDefinition {
  const tokens = tokenizeSpellings(...extras);
  const seen = new Set(allFactorSpellings(factor).map(normalizeFactorKey));
  const aliases = tokenizeSpellings(...factor.aliases);
  const nameKey = normalizeFactorKey(factor.name);

  for (const token of tokens) {
    const key = normalizeFactorKey(token);
    if (seen.has(key)) continue;
    seen.add(key);
    if (key !== nameKey) {
      aliases.push(token);
    }
  }

  return { ...factor, name: factor.name.trim() || tokens[0] || factor.name, aliases };
}

/** Substitui o conjunto de grafias do fator (nome canônico + aliases). */
export function replaceSpellings(
  factor: FactorDefinition,
  spellings: string[],
): FactorDefinition {
  const tokens = tokenizeSpellings(...spellings);
  if (tokens.length === 0) {
    return { ...factor, aliases: [] };
  }

  const preferredName = factor.name.trim();
  const preferredKey = normalizeFactorKey(preferredName);
  const name =
    (preferredName && tokens.some((t) => normalizeFactorKey(t) === preferredKey)
      ? preferredName
      : tokens[0]) || preferredName;

  const nameKey = normalizeFactorKey(name);
  const aliases = tokens.filter((token) => normalizeFactorKey(token) !== nameKey);
  return { id: factor.id, name, aliases };
}

export function ensureFactorInCatalog(
  catalog: FactorDefinition[],
  input: { id?: string; name: string; aliases?: string[] },
): { factor: FactorDefinition; catalog: FactorDefinition[] } {
  const nextCatalog = catalog.map((f) => ({
    ...f,
    aliases: tokenizeSpellings(...f.aliases),
    name: tokenizeSpellings(f.name)[0] ?? f.name,
  }));

  const upsert = (factor: FactorDefinition): FactorDefinition => {
    const idx = nextCatalog.findIndex((f) => f.id === factor.id);
    if (idx >= 0) {
      nextCatalog[idx] = factor;
    } else {
      nextCatalog.push(factor);
    }
    return factor;
  };

  const nameTokens = tokenizeSpellings(input.name);
  const name = nameTokens[0];
  if (!name) {
    throw new Error('Nome do fator é obrigatório');
  }

  const aliasTokens = tokenizeSpellings(...(input.aliases ?? []), ...nameTokens);

  // Qualquer grafia (nome ou alias) já existente no catálogo identifica o mesmo fator.
  let factor =
    (input.id ? nextCatalog.find((f) => f.id === input.id) : undefined) ??
    findFactorBySpelling(nextCatalog, name);

  if (!factor) {
    for (const token of aliasTokens) {
      factor = findFactorBySpelling(nextCatalog, token);
      if (factor) break;
    }
  }

  if (!factor) {
    factor = {
      id: input.id?.trim() || randomUUID(),
      name,
      aliases: [],
    };
  }

  factor = upsert(mergeAliases(factor, aliasTokens));

  return { factor, catalog: nextCatalog };
}

export function resolveArticleFactors(
  inputs: ArticleFactorInput[],
  catalog: FactorDefinition[],
): { factors: ArticleFactor[]; catalog: FactorDefinition[] } {
  const nextCatalog = catalog.map((f) => ({
    ...f,
    aliases: tokenizeSpellings(...f.aliases),
    name: tokenizeSpellings(f.name)[0] ?? f.name,
  }));

  const upsert = (factor: FactorDefinition): FactorDefinition => {
    const idx = nextCatalog.findIndex((f) => f.id === factor.id);
    if (idx >= 0) {
      nextCatalog[idx] = factor;
    } else {
      nextCatalog.push(factor);
    }
    return factor;
  };

  const factors: ArticleFactor[] = [];

  for (const input of inputs) {
    const labelTokens = tokenizeSpellings(input.label);
    const label = labelTokens[0];
    if (!label) continue;

    const polarity: FactorPolarity =
      input.polarity === 'negative' ? 'negative' : 'positive';
    const description = (input.description ?? '').trim();
    const extraAliases = tokenizeSpellings(
      ...labelTokens,
      ...(input.aliases ?? []),
    );

    let factor =
      (input.factorId
        ? nextCatalog.find((f) => f.id === input.factorId)
        : undefined) ?? findFactorBySpelling(nextCatalog, label);

    if (!factor) {
      for (const token of extraAliases) {
        factor = findFactorBySpelling(nextCatalog, token);
        if (factor) break;
      }
    }

    if (!factor) {
      factor = upsert({
        id: input.factorId?.trim() || randomUUID(),
        name: label,
        aliases: [],
      });
    }

    factor = upsert(mergeAliases(factor, extraAliases));

    factors.push({
      factorId: factor.id,
      polarity,
      description,
      label,
    });
  }

  return { factors, catalog: nextCatalog };
}

/** Primeira citação entre aspas curvas ou retas, com corpo de tamanho útil. */
const CITACAO_RE = /[“"']([^“”"']{12,})[”"']/;
/** Referência de seção: "Seção 4.2.1", "Section 5", "Sec. 3.1", "§4". */
const SECAO_RE = /(?:Se[çc][ãa]o|Section|Sect\.?|Sec\.?|§)\s*\d[\w.]*/i;
/** Marcador de participantes/tabela entre parênteses: "(P2)", "(P3, P7)", "(n=12)". */
const PARENTESES_RE = /\(([^()]{1,40})\)/g;

export type LimpezaDescricao =
  | { tipo: 'inalterada' }
  | { tipo: 'reescrita'; description: string }
  | { tipo: 'revisar'; motivo: string };

/**
 * Tira da `description` o resumo em português que antecede a citação. O prompt
 * antigo pedia "resumo em PT — citação verbatim", e na tela Fatores as duas
 * partes ficam lado a lado: o resumo virou repetição do que está entre aspas.
 *
 * Só reescreve o que entende por inteiro — referência da seção + citação. Sem
 * referência reconhecível, devolve `revisar` em vez de apagar texto que talvez
 * seja a única pista de onde o trecho está no PDF.
 */
export function stripPortugueseRestatement(description: string): LimpezaDescricao {
  const original = description.trim();
  if (!original) return { tipo: 'inalterada' };

  const citacao = CITACAO_RE.exec(original);
  if (!citacao) {
    return { tipo: 'revisar', motivo: 'sem citação entre aspas' };
  }

  const prefixo = original.slice(0, citacao.index);
  const secao = SECAO_RE.exec(prefixo)?.[0];
  if (!secao) {
    return { tipo: 'revisar', motivo: 'sem referência de seção antes da citação' };
  }

  // O último parêntese antes da citação costuma trazer o participante. Ele
  // frequentemente vem junto da seção ("(Seção 4.1.1, P9)"): tira-se a seção e
  // fica o participante. Se não sobrar nada, o parêntese era só a referência.
  const parenteses = [...prefixo.matchAll(PARENTESES_RE)]
    .map((m) => m[1].replace(SECAO_RE, '').replace(/^[\s,;]+|[\s,;]+$/g, ''))
    .filter((texto) => texto.length > 0);
  const participantes = parenteses.at(-1);

  const referencia = participantes ? `${secao} (${participantes})` : secao;
  const limpa = `${referencia}: “${citacao[1].trim()}”.`;
  return limpa === original ? { tipo: 'inalterada' } : { tipo: 'reescrita', description: limpa };
}
