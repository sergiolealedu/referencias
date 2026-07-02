import type { Article } from '../types/referencias.js';

export interface ArticleRow {
  id: number;
  group_id: number;
  entry_key: string;
  entry_type: string;
  fields_json: string;
  status: string;
  source: string;
  location: string;
  caminho: string;
  notes: string;
  tags_json: string;
  descartado: number;
  usado: number;
  duplicate_group_id: number | null;
  duplicate_key: string | null;
}

export function rowToArticle(row: ArticleRow): Article {
  return {
    entry: {
      type: row.entry_type,
      key: row.entry_key,
      fields: JSON.parse(row.fields_json) as Record<string, string>,
    },
    status: row.status,
    source: row.source,
    location: row.location,
    caminho: row.caminho,
    notes: row.notes,
    tags: JSON.parse(row.tags_json) as string[],
    descartado: row.descartado === 1,
    usado: row.usado === 1,
    ...(row.duplicate_group_id != null && row.duplicate_key
      ? { duplicateOf: { groupId: row.duplicate_group_id, key: row.duplicate_key } }
      : {}),
  };
}

export function articleToRowValues(
  groupId: number,
  article: Article,
): Omit<ArticleRow, 'id'> {
  return {
    group_id: groupId,
    entry_key: article.entry.key,
    entry_type: article.entry.type,
    fields_json: JSON.stringify(article.entry.fields),
    status: article.status,
    source: article.source,
    location: article.location,
    caminho: article.caminho,
    notes: article.notes,
    tags_json: JSON.stringify(article.tags),
    descartado: article.descartado ? 1 : 0,
    usado: article.usado ? 1 : 0,
    duplicate_group_id: article.duplicateOf?.groupId ?? null,
    duplicate_key: article.duplicateOf?.key ?? null,
  };
}

export function ftsQuery(q: string): string {
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(' ');
}
