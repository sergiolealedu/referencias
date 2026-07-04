import type { Article } from '../types/referencias';

/** Extrai URL de valores `\url{...}`, `\urlhttps://...` ou URL simples. */
export function extractHowpublishedUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const braced = trimmed.match(/^\\+url\{(.*)\}$/is);
  if (braced) return braced[1].trim();

  const bare = trimmed.match(/^\\+url(https?:\/\/.+)$/i);
  if (bare) return bare[1];

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  return null;
}

/** Remove aspas simples ou duplas envolvendo o valor. */
export function stripWrappingQuotes(value: string): string {
  let trimmed = value.trim();
  while (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      trimmed = trimmed.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return trimmed;
}

export function caminhoForStorage(value: string): string {
  return stripWrappingQuotes(value);
}

/** Valor legível no formulário (URL sem prefixo `\url`). */
export function howpublishedForForm(value: string): string {
  return extractHowpublishedUrl(value) ?? value;
}

/** Valor a persistir no JSON (URL simples ou texto livre). */
export function howpublishedForStorage(formValue: string): string {
  const trimmed = formValue.trim();
  if (!trimmed) return '';
  const url = extractHowpublishedUrl(trimmed);
  if (url) return url;
  return trimmed;
}

export function normalizeAbstractForForm(value: string): string {
  let trimmed = value.trim();
  if (!trimmed) return trimmed;
  trimmed = trimmed.replace(/^abstract\s*[:-]?\s+/i, '');
  return trimmed;
}

export function normalizeFieldsForForm(fields: Record<string, string>): Record<string, string> {
  const result = { ...fields };
  if (result.howpublished) {
    result.howpublished = howpublishedForForm(result.howpublished);
  }
  if (result.abstract) {
    result.abstract = normalizeAbstractForForm(result.abstract);
  }
  return result;
}

export function normalizeArticleForForm(article: Article): Article {
  return {
    ...article,
    caminho: caminhoForStorage(article.caminho ?? ''),
    factors: article.factors ?? [],
    entry: {
      ...article.entry,
      fields: normalizeFieldsForForm(article.entry.fields),
    },
  };
}

/** Formato interno para exportação BibTeX: `\url{https://...}`. */
export function normalizeHowpublishedForBibtex(value: string): string {
  const url = extractHowpublishedUrl(value);
  if (url) return `\\url{${url}}`;
  return value.trim();
}
