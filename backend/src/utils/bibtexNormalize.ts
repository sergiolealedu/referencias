function hasBalancedOuterBraces(value: string): boolean {
  if (!value.startsWith('{') || !value.endsWith('}')) return false;
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '{') depth += 1;
    else if (value[i] === '}') depth -= 1;
    if (depth === 0 && i < value.length - 1) return false;
  }
  return depth === 0;
}

function removeSimpleBraces(text: string): string {
  return text.replace(/\{([^{}\\]*)\}/g, '$1');
}

function unwrapSegmentBraces(segment: string): string {
  let value = segment.trim();
  while (hasBalancedOuterBraces(value)) {
    const inner = value.slice(1, -1).trim();
    if (inner.includes('\\')) break;
    value = inner;
  }
  return removeSimpleBraces(value);
}

/** Remove chaves BibTeX em torno de nomes de autor e normaliza `{-}`. */
export function normalizeAuthorField(author: string): string {
  let value = author.trim();
  if (!value) return value;

  value = value.replace(/\{-\}/g, '-');

  value = value
    .split(/\s+and\s+/i)
    .map((segment) => unwrapSegmentBraces(segment.trim()))
    .join(' and ');

  return removeSimpleBraces(value).replace(/\s+/g, ' ').trim();
}

export function normalizeAbstractField(abstract: string): string {
  let value = abstract.trim();
  if (!value) return value;
  value = value.replace(/^abstract\s*[:-]?\s+/i, '');
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeEntryFields(fields: Record<string, string>): Record<string, string> {
  const result = { ...fields };
  if (result.author) {
    result.author = normalizeAuthorField(result.author);
  }
  if (result.abstract) {
    result.abstract = normalizeAbstractField(result.abstract);
  }
  return result;
}
