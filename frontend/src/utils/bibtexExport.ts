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

/**
 * Campos do BibTeX padrão, mais `doi` (fora do padrão original, mas aceito por
 * todo mundo). São os que mudam a citação renderizada.
 *
 * O que vem do Scopus/IEEE além disso — abstract, keywords, affiliations,
 * funding_details, references, art_number... — engorda o .bib em ordens de
 * grandeza sem alterar uma citação. Por isso o seletor de campos do export
 * nasce com este conjunto marcado e todo o resto desmarcado.
 */
export const BIBTEX_CORE_FIELDS = [
  'address',
  'author',
  'booktitle',
  'chapter',
  'doi',
  'edition',
  'editor',
  'howpublished',
  'institution',
  'journal',
  'month',
  'note',
  'number',
  'organization',
  'pages',
  'publisher',
  'school',
  'series',
  'title',
  'type',
  'volume',
  'year',
] as const;

const CORE_FIELD_SET = new Set<string>(BIBTEX_CORE_FIELDS);

/** Nome de campo do BibTeX é insensível a caixa: `Abstract` e `abstract` são o mesmo. */
function fieldKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Entra marcado por padrão no seletor de campos do export. */
export function isCoreBibtexField(name: string): boolean {
  return CORE_FIELD_SET.has(fieldKey(name));
}

export interface BibtexExportOptions {
  /**
   * Campos a incluir na saída. Omitido significa "todos" — é o comportamento
   * dos outros pontos de export (entrada única, grupo inteiro), que não filtram.
   */
  fields?: Iterable<string>;
}

/** `null` quando nada foi restringido: evita montar um Set por entrada. */
function allowedFieldSet(options: BibtexExportOptions): Set<string> | null {
  if (!options.fields) return null;
  return new Set([...options.fields].map(fieldKey));
}

export interface BibtexFieldUsage {
  name: string;
  /** Em quantas das entradas o campo está preenchido. */
  count: number;
}

/**
 * Os campos presentes nas entradas, na MESMA ordem em que sairiam no arquivo:
 * `PREFERRED_FIELD_ORDER` primeiro, o resto em ordem alfabética. O seletor da
 * interface lista por esta função para não contradizer a ordem da saída.
 */
export function collectBibtexFieldNames(articles: Article[]): BibtexFieldUsage[] {
  const counts = new Map<string, number>();

  for (const article of articles) {
    for (const [name, value] of Object.entries(article.entry.fields)) {
      if (!value?.trim()) continue;
      const key = fieldKey(name);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const preferidos = PREFERRED_FIELD_ORDER.filter((name) => counts.has(name));
  const preferidoSet = new Set<string>(preferidos);
  const restantes = [...counts.keys()]
    .filter((name) => !preferidoSet.has(name))
    .sort((a, b) => a.localeCompare(b));

  return [...preferidos, ...restantes].map((name) => ({
    name,
    count: counts.get(name) ?? 0,
  }));
}

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

export function articleToBibtex(
  article: Article,
  options: BibtexExportOptions = {},
): string {
  const { type, key, fields } = article.entry;
  if (!key.trim()) {
    throw new Error('Chave do artigo é obrigatória para exportar BibTeX');
  }

  const allowed = allowedFieldSet(options);
  const incluir = (name: string) => allowed === null || allowed.has(fieldKey(name));

  const lines = [`@${type}{${key},`];
  // `used` marca o que a primeira passada JÁ TRATOU, incluído ou não. Marcar só
  // o que entrou faria um campo preferido desmarcado voltar pela passada
  // alfabética, fora de ordem e contra a seleção.
  const used = new Set<string>();

  for (const name of PREFERRED_FIELD_ORDER) {
    const value = fields[name]?.trim();
    if (value) {
      used.add(name);
      if (incluir(name)) lines.push(formatField(name, value));
    }
  }

  for (const [name, value] of Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))) {
    const trimmed = value?.trim();
    if (!used.has(name) && trimmed && incluir(name)) {
      lines.push(formatField(name, trimmed));
    }
  }

  lines.push('}');
  return lines.join('\n');
}

export function articlesToBibtex(
  articles: Article[],
  options: BibtexExportOptions = {},
): string {
  if (articles.length === 0) {
    throw new Error('Selecione ao menos uma entrada para exportar');
  }
  return articles.map((article) => articleToBibtex(article, options)).join('\n\n');
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

export function downloadBibtexBulk(
  articles: Article[],
  filename = 'referencias.bib',
  options: BibtexExportOptions = {},
): void {
  const bibtex = articlesToBibtex(articles, options);
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

export async function copyBibtexBulkToClipboard(
  articles: Article[],
  options: BibtexExportOptions = {},
): Promise<void> {
  const bibtex = articlesToBibtex(articles, options);
  await navigator.clipboard.writeText(bibtex);
}

export async function copyUsadoBibtexByKeyToClipboard(articles: Article[]): Promise<void> {
  const bibtex = usadoArticlesToBibtex(articles);
  await navigator.clipboard.writeText(bibtex);
}
