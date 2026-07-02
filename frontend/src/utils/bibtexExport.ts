import type { Article, SearchResult } from '../types/referencias';
import { normalizeHowpublishedForBibtex } from './bibtexFields';

const PREFERRED_FIELD_ORDER = [
  'title',
  'author',
  'editor',
  'journal',
  'booktitle',
  'year',
  'volume',
  'number',
  'pages',
  'abstract',
  'publisher',
  'doi',
  'isbn',
  'series',
  'address',
  'month',
  'url',
];

function escapeBibtexValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/}/g, '\\}');
}

function formatField(name: string, value: string): string {
  if (name === 'howpublished') {
    const normalized = normalizeHowpublishedForBibtex(value);
    const urlCommand = normalized.match(/^\\url\{(.*)\}$/s);
    if (urlCommand) {
      const url = urlCommand[1].replace(/\\/g, '\\\\').replace(/}/g, '\\}');
      return `  howpublished = {\\url{${url}}},`;
    }
  }

  return `  ${name} = {${escapeBibtexValue(value)}},`;
}

export function articleToBibtex(article: Article): string {
  const { type, key, fields } = article.entry;
  if (!key.trim()) {
    throw new Error('Chave do artigo é obrigatória para exportar BibTeX');
  }

  const lines = [`@${type}{${key},`];
  const used = new Set<string>();

  for (const name of PREFERRED_FIELD_ORDER) {
    const value = fields[name]?.trim();
    if (value) {
      lines.push(formatField(name, value));
      used.add(name);
    }
  }

  for (const [name, value] of Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))) {
    const trimmed = value?.trim();
    if (!used.has(name) && trimmed) {
      lines.push(formatField(name, trimmed));
    }
  }

  lines.push('}');
  return lines.join('\n');
}

export function articlesToBibtex(articles: Article[]): string {
  if (articles.length === 0) {
    throw new Error('Selecione ao menos uma entrada para exportar');
  }
  return articles.map((article) => articleToBibtex(article)).join('\n\n');
}

export function usadoItemKey(item: SearchResult): string {
  return `${item.groupId}:${item.article.entry.key}`;
}

/** Entradas com `usado`, ordenadas pela chave BibTeX (id). */
export function getUsadoArticlesOrderedByKey(articles: Article[]): Article[] {
  return articles
    .filter((article) => article.usado)
    .sort((a, b) =>
      a.entry.key.localeCompare(b.entry.key, 'pt-BR', { sensitivity: 'base' }),
    );
}

export function usadoArticlesToBibtex(articles: Article[]): string {
  const usado = getUsadoArticlesOrderedByKey(articles);
  if (usado.length === 0) {
    throw new Error('Nenhuma entrada marcada como usada neste grupo');
  }
  return articlesToBibtex(usado);
}

export function downloadBibtex(article: Article): void {
  const bibtex = articleToBibtex(article);
  const blob = new Blob([bibtex], { type: 'application/x-bibtex;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${article.entry.key}.bib`;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadBibtexBulk(articles: Article[], filename = 'referencias.bib'): void {
  const bibtex = articlesToBibtex(articles);
  const blob = new Blob([bibtex], { type: 'application/x-bibtex;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadUsadoBibtexByKey(
  articles: Article[],
  filename = 'usados.bib',
): void {
  const bibtex = usadoArticlesToBibtex(articles);
  const blob = new Blob([bibtex], { type: 'application/x-bibtex;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function copyBibtexToClipboard(article: Article): Promise<void> {
  const bibtex = articleToBibtex(article);
  await navigator.clipboard.writeText(bibtex);
}

export async function copyBibtexBulkToClipboard(articles: Article[]): Promise<void> {
  const bibtex = articlesToBibtex(articles);
  await navigator.clipboard.writeText(bibtex);
}

export async function copyUsadoBibtexByKeyToClipboard(articles: Article[]): Promise<void> {
  const bibtex = usadoArticlesToBibtex(articles);
  await navigator.clipboard.writeText(bibtex);
}
