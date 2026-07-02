import type Database from 'better-sqlite3';

import { normalizeAuthorField, normalizeEntryFields } from '../utils/bibtexNormalize.js';
import { buildDuplicateMap, type ArticleIdentity } from '../utils/duplicateDetection.js';
import {
  normalizeListParams,
  SORT_COLUMN_SQL,
} from './articleQuery.js';
import { articleToRowValues, ftsQuery, rowToArticle, type ArticleRow } from './articleMapper.js';
import { openDatabase } from './sqliteDb.js';
import { StoreError } from './storeError.js';
import type {
  Article,
  ArticleListParams,
  BibtexImportOptions,
  BibtexImportResult,
  GroupMeta,
  GroupSummary,
  PaginatedArticles,
  DuplicateDetectionResult,
  GroupArticleStats,
  PaginatedSearchResults,
  SearchResult,
  SortColumn,
  YearArticleStats,
} from '../types/referencias.js';

interface FilterClause {
  sql: string;
  params: unknown[];
}

function buildArticleFilters(
  filters: ArticleListParams,
  alias = 'a',
): FilterClause {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    conditions.push(`${alias}.status = ?`);
    params.push(filters.status);
  }
  if (filters.usado !== undefined) {
    conditions.push(`${alias}.usado = ?`);
    params.push(filters.usado ? 1 : 0);
  }
  if (filters.descartado !== undefined) {
    conditions.push(`${alias}.descartado = ?`);
    params.push(filters.descartado ? 1 : 0);
  }
  if (filters.tags && filters.tags.length > 0) {
    const placeholders = filters.tags.map(() => '?').join(', ');
    conditions.push(
      `(SELECT COUNT(DISTINCT je.value) FROM json_each(${alias}.tags_json) je WHERE je.value IN (${placeholders})) = ?`,
    );
    params.push(...filters.tags, filters.tags.length);
  }
  if (filters.q) {
    conditions.push(`${alias}.id IN (SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?)`);
    params.push(ftsQuery(filters.q));
  }

  return {
    sql: conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '',
    params,
  };
}

function orderByClause(sortBy?: SortColumn, sortDir: 'asc' | 'desc' = 'asc'): string {
  if (!sortBy) return `${SORT_COLUMN_SQL.title} ASC`;
  const col = SORT_COLUMN_SQL[sortBy];
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  return `${col} ${dir}, entry_key ASC`;
}

export class SqliteStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = openDatabase(dbPath);
  }

  close(): void {
    this.db.close();
  }

  private getGroupRow(groupId: number) {
    const row = this.db
      .prepare(
        `SELECT g.*, (SELECT COUNT(*) FROM articles a WHERE a.group_id = g.id) AS article_count
         FROM groups g WHERE g.id = ?`,
      )
      .get(groupId) as
      | {
          id: number;
          title: string;
          versao: string;
          mecanismo: string;
          string_busca: string;
          created_at: string;
          article_count: number;
        }
      | undefined;
    if (!row) {
      throw new StoreError(`Grupo ${groupId} não encontrado`, 'NOT_FOUND');
    }
    return row;
  }

  private toGroupMeta(row: {
    id: number;
    title: string;
    versao: string;
    mecanismo: string;
    string_busca: string;
    created_at: string;
    article_count: number;
  }): GroupMeta {
    return {
      id: row.id,
      title: row.title,
      versao: row.versao,
      mecanismo: row.mecanismo,
      stringBusca: row.string_busca,
      createdAt: row.created_at,
      articleCount: row.article_count,
    };
  }

  async listGroups(): Promise<GroupSummary[]> {
    const rows = this.db
      .prepare(
        `SELECT g.*, (SELECT COUNT(*) FROM articles a WHERE a.group_id = g.id) AS article_count
         FROM groups g
         ORDER BY g.title COLLATE NOCASE`,
      )
      .all() as Array<{
      id: number;
      title: string;
      versao: string;
      mecanismo: string;
      string_busca: string;
      created_at: string;
      article_count: number;
    }>;
    return rows.map((row) => this.toGroupMeta(row));
  }

  async listUsadoArticles(): Promise<SearchResult[]> {
    const rows = this.db
      .prepare(
        `SELECT g.id AS group_id, g.title AS group_title, a.*
         FROM articles a
         JOIN groups g ON g.id = a.group_id
         WHERE a.usado = 1
         ORDER BY a.entry_key COLLATE NOCASE`,
      )
      .all() as Array<ArticleRow & { group_id: number; group_title: string }>;

    return rows.map((row) => ({
      groupId: row.group_id,
      groupTitle: row.group_title,
      article: rowToArticle(row),
    }));
  }

  async getGroup(groupId: number): Promise<GroupMeta> {
    return this.toGroupMeta(this.getGroupRow(groupId));
  }

  async listGroupTags(groupId: number): Promise<string[]> {
    this.getGroupRow(groupId);
    const rows = this.db
      .prepare(
        `SELECT DISTINCT je.value AS tag
         FROM articles a, json_each(a.tags_json) je
         WHERE a.group_id = ?
         ORDER BY tag COLLATE NOCASE`,
      )
      .all(groupId) as Array<{ tag: string }>;
    return rows.map((r) => r.tag);
  }

  async createGroup(input: {
    title: string;
    versao?: string;
    mecanismo?: string;
    stringBusca?: string;
  }): Promise<GroupMeta> {
    const group = {
      id: Date.now(),
      title: input.title,
      versao: input.versao ?? 'v2',
      mecanismo: input.mecanismo ?? 'Scopus',
      string_busca: input.stringBusca ?? '',
      created_at: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO groups (id, title, versao, mecanismo, string_busca, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        group.id,
        group.title,
        group.versao,
        group.mecanismo,
        group.string_busca,
        group.created_at,
      );
    return {
      id: group.id,
      title: group.title,
      versao: group.versao,
      mecanismo: group.mecanismo,
      stringBusca: group.string_busca,
      createdAt: group.created_at,
      articleCount: 0,
    };
  }

  async updateGroup(
    groupId: number,
    patch: {
      title: string;
      versao?: string;
      mecanismo?: string;
      stringBusca?: string;
    },
  ): Promise<GroupMeta> {
    this.getGroupRow(groupId);
    const current = this.getGroupRow(groupId);
    const versao = patch.versao ?? current.versao;
    const mecanismo = patch.mecanismo ?? current.mecanismo;
    const stringBusca = patch.stringBusca ?? current.string_busca;
    this.db
      .prepare(
        `UPDATE groups SET title = ?, versao = ?, mecanismo = ?, string_busca = ? WHERE id = ?`,
      )
      .run(patch.title, versao, mecanismo, stringBusca, groupId);
    return this.getGroup(groupId);
  }

  async deleteGroup(groupId: number): Promise<void> {
    const result = this.db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
    if (result.changes === 0) {
      throw new StoreError(`Grupo ${groupId} não encontrado`, 'NOT_FOUND');
    }
  }

  async clearGroupArticles(groupId: number): Promise<{ deleted: number }> {
    this.getGroupRow(groupId);
    let deleted = 0;
    const tx = this.db.transaction(() => {
      deleted = (
        this.db
          .prepare('SELECT COUNT(*) AS c FROM articles WHERE group_id = ?')
          .get(groupId) as { c: number }
      ).c;
      this.db.prepare('DELETE FROM articles_fts WHERE group_id = ?').run(groupId);
      this.db.prepare('DELETE FROM articles WHERE group_id = ?').run(groupId);
    });
    tx();
    return { deleted };
  }

  async listArticles(
    groupId: number,
    params: ArticleListParams = {},
  ): Promise<PaginatedArticles> {
    this.getGroupRow(groupId);
    const { filters, page, pageSize, sortBy, sortDir, findKey } =
      normalizeListParams(params);
    const { sql: filterSql, params: filterParams } = buildArticleFilters(filters);
    const whereBase = `a.group_id = ?${filterSql}`;
    const baseParams = [groupId, ...filterParams];

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM articles a WHERE ${whereBase}`)
      .get(...baseParams) as { total: number };
    const total = countRow.total;

    let effectivePage = page;
    let foundPage: number | undefined;

    if (findKey) {
      const order = orderByClause(sortBy, sortDir);
      const rankRow = this.db
        .prepare(
          `WITH ranked AS (
             SELECT entry_key, ROW_NUMBER() OVER (ORDER BY ${order}) AS rn
             FROM articles a
             WHERE ${whereBase}
           )
           SELECT rn FROM ranked WHERE entry_key = ?`,
        )
        .get(...baseParams, findKey) as { rn: number } | undefined;
      if (rankRow) {
        foundPage = Math.floor((rankRow.rn - 1) / pageSize) + 1;
        effectivePage = foundPage;
      }
    }

    const order = orderByClause(sortBy, sortDir);
    const offset = (effectivePage - 1) * pageSize;
    const rows = this.db
      .prepare(
        `SELECT * FROM articles a
         WHERE ${whereBase}
         ORDER BY ${order}
         LIMIT ? OFFSET ?`,
      )
      .all(...baseParams, pageSize, offset) as ArticleRow[];

    return {
      items: rows.map(rowToArticle),
      total,
      page: effectivePage,
      pageSize,
      ...(foundPage !== undefined ? { foundPage } : {}),
    };
  }

  async exportArticlesByKeys(groupId: number, keys: string[]): Promise<Article[]> {
    this.getGroupRow(groupId);
    if (keys.length === 0) return [];
    const placeholders = keys.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT * FROM articles WHERE group_id = ? AND entry_key IN (${placeholders})`,
      )
      .all(groupId, ...keys) as ArticleRow[];
    return rows.map(rowToArticle);
  }

  async getArticle(groupId: number, key: string): Promise<Article> {
    const row = this.db
      .prepare('SELECT * FROM articles WHERE group_id = ? AND entry_key = ?')
      .get(groupId, key) as ArticleRow | undefined;
    if (!row) {
      throw new StoreError(
        `Artigo "${key}" não encontrado no grupo ${groupId}`,
        'NOT_FOUND',
      );
    }
    return rowToArticle(row);
  }

  async createArticle(groupId: number, article: Article): Promise<Article> {
    this.getGroupRow(groupId);
    const exists = this.db
      .prepare('SELECT 1 FROM articles WHERE group_id = ? AND entry_key = ?')
      .get(groupId, article.entry.key);
    if (exists) {
      throw new StoreError(
        `Artigo com chave "${article.entry.key}" já existe neste grupo`,
        'CONFLICT',
      );
    }
    const values = articleToRowValues(groupId, article);
    this.db
      .prepare(
        `INSERT INTO articles (
          group_id, entry_key, entry_type, fields_json, status, source, location,
          caminho, notes, tags_json, descartado, usado, duplicate_group_id, duplicate_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        values.group_id,
        values.entry_key,
        values.entry_type,
        values.fields_json,
        values.status,
        values.source,
        values.location,
        values.caminho,
        values.notes,
        values.tags_json,
        values.descartado,
        values.usado,
        values.duplicate_group_id,
        values.duplicate_key,
      );
    return structuredClone(article);
  }

  private updateDuplicateRefsForKeyRename(
    groupId: number,
    oldKey: string,
    newKey: string,
  ): void {
    this.db
      .prepare(
        `UPDATE articles SET duplicate_key = ?
         WHERE duplicate_group_id = ? AND duplicate_key = ?`,
      )
      .run(newKey, groupId, oldKey);
  }

  async updateArticle(
    groupId: number,
    key: string,
    patch: Partial<Article> & { entry?: Partial<Article['entry']> },
  ): Promise<Article> {
    const current = await this.getArticle(groupId, key);
    const newKey = patch.entry?.key;

    if (newKey && newKey !== key) {
      const exists = this.db
        .prepare(
          'SELECT 1 FROM articles WHERE group_id = ? AND entry_key = ? AND entry_key != ?',
        )
        .get(groupId, newKey, key);
      if (exists) {
        throw new StoreError(
          `Artigo com chave "${newKey}" já existe neste grupo`,
          'CONFLICT',
        );
      }
      this.updateDuplicateRefsForKeyRename(groupId, key, newKey);
    }

    const merged: Article = {
      ...current,
      ...patch,
      entry: {
        ...current.entry,
        ...patch.entry,
        fields: {
          ...current.entry.fields,
          ...patch.entry?.fields,
        },
      },
    };

    const values = articleToRowValues(groupId, merged);
    const result = this.db
      .prepare(
        `UPDATE articles SET
          entry_key = ?, entry_type = ?, fields_json = ?, status = ?, source = ?,
          location = ?, caminho = ?, notes = ?, tags_json = ?, descartado = ?,
          usado = ?, duplicate_group_id = ?, duplicate_key = ?
         WHERE group_id = ? AND entry_key = ?`,
      )
      .run(
        values.entry_key,
        values.entry_type,
        values.fields_json,
        values.status,
        values.source,
        values.location,
        values.caminho,
        values.notes,
        values.tags_json,
        values.descartado,
        values.usado,
        values.duplicate_group_id,
        values.duplicate_key,
        groupId,
        key,
      );

    if (result.changes === 0) {
      throw new StoreError(
        `Artigo "${key}" não encontrado no grupo ${groupId}`,
        'NOT_FOUND',
      );
    }

    return structuredClone(merged);
  }

  async deleteArticle(groupId: number, key: string): Promise<void> {
    const result = this.db
      .prepare('DELETE FROM articles WHERE group_id = ? AND entry_key = ?')
      .run(groupId, key);
    if (result.changes === 0) {
      throw new StoreError(
        `Artigo "${key}" não encontrado no grupo ${groupId}`,
        'NOT_FOUND',
      );
    }
  }

  async searchArticles(
    params: ArticleListParams = {},
  ): Promise<PaginatedSearchResults> {
    const { filters, page, pageSize, sortBy, sortDir } = normalizeListParams(params);
    const { sql: filterSql, params: filterParams } = buildArticleFilters(filters);
    const whereBase = `1=1${filterSql}`;
    const baseParams = [...filterParams];

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM articles a WHERE ${whereBase}`)
      .get(...baseParams) as { total: number };
    const total = countRow.total;

    const order = orderByClause(sortBy, sortDir);
    const offset = (page - 1) * pageSize;
    const rows = this.db
      .prepare(
        `SELECT g.id AS group_id, g.title AS group_title, a.*
         FROM articles a
         JOIN groups g ON g.id = a.group_id
         WHERE ${whereBase}
         ORDER BY ${order}
         LIMIT ? OFFSET ?`,
      )
      .all(...baseParams, pageSize, offset) as Array<
      ArticleRow & { group_id: number; group_title: string }
    >;

    return {
      items: rows.map((row) => ({
        groupId: row.group_id,
        groupTitle: row.group_title,
        article: rowToArticle(row),
      })),
      total,
      page,
      pageSize,
    };
  }

  async importBibtex(
    targetGroupId: number,
    entries: Array<{ type: string; key: string; fields: Record<string, string> }>,
    options: BibtexImportOptions,
  ): Promise<BibtexImportResult> {
    const result: BibtexImportResult = {
      parsed: entries.length,
      imported: 0,
      skipped: 0,
      duplicates: 0,
      items: [],
    };

    if (entries.length === 0) return result;

    this.getGroupRow(targetGroupId);

    let referenceGroupId: number | null = null;
    const referenceKeys = new Set<string>();

    if (options.originArticle) {
      await this.getArticle(options.originArticle.groupId, options.originArticle.key);
      referenceGroupId = options.originArticle.groupId;
      const originArticles = this.db
        .prepare('SELECT entry_key FROM articles WHERE group_id = ?')
        .all(referenceGroupId) as Array<{ entry_key: string }>;
      for (const row of originArticles) {
        referenceKeys.add(row.entry_key);
      }
    }

    const insert = this.db.prepare(
      `INSERT INTO articles (
        group_id, entry_key, entry_type, fields_json, status, source, location,
        caminho, notes, tags_json, descartado, usado, duplicate_group_id, duplicate_key
      ) VALUES (?, ?, ?, ?, ?, ?, '', '', '', '[]', 0, 0, ?, ?)`,
    );

    const importTx = this.db.transaction(() => {
      for (const entry of entries) {
        const exists = this.db
          .prepare('SELECT 1 FROM articles WHERE group_id = ? AND entry_key = ?')
          .get(targetGroupId, entry.key);
        if (exists) {
          result.skipped += 1;
          result.items.push({
            key: entry.key,
            outcome: 'skipped',
            message: 'Já existe neste grupo',
          });
          continue;
        }

        const matchesOrigin =
          referenceGroupId !== null && referenceKeys.has(entry.key);

        insert.run(
          targetGroupId,
          entry.key,
          entry.type,
          JSON.stringify(normalizeEntryFields(entry.fields)),
          matchesOrigin ? 'duplicate' : 'exists',
          options.source,
          matchesOrigin ? referenceGroupId : null,
          matchesOrigin ? entry.key : null,
        );

        result.imported += 1;
        if (matchesOrigin) {
          result.duplicates += 1;
          result.items.push({ key: entry.key, outcome: 'duplicate' });
        } else {
          result.items.push({ key: entry.key, outcome: 'imported' });
        }
      }
    });

    importTx();
    return result;
  }

  markCrossGroupDuplicates(versao = 'v2'): DuplicateDetectionResult {
    const rows = this.db
      .prepare(
        `SELECT a.group_id, a.entry_key, a.status, a.duplicate_group_id, a.duplicate_key, a.fields_json
         FROM articles a
         JOIN groups g ON g.id = a.group_id
         WHERE g.versao = ?
         ORDER BY a.group_id ASC, a.entry_key ASC`,
      )
      .all(versao) as Array<{
      group_id: number;
      entry_key: string;
      status: string;
      duplicate_group_id: number | null;
      duplicate_key: string | null;
      fields_json: string;
    }>;

    const articles: ArticleIdentity[] = rows.map((row) => ({
      groupId: row.group_id,
      key: row.entry_key,
      fields: JSON.parse(row.fields_json) as Record<string, string>,
    }));

    const duplicateMap = buildDuplicateMap(articles);

    const markDuplicate = this.db.prepare(
      `UPDATE articles SET status = 'duplicate', duplicate_group_id = ?, duplicate_key = ?
       WHERE group_id = ? AND entry_key = ?`,
    );
    const clearDuplicate = this.db.prepare(
      `UPDATE articles SET status = 'exists', duplicate_group_id = NULL, duplicate_key = NULL
       WHERE group_id = ? AND entry_key = ?`,
    );

    const result: DuplicateDetectionResult = {
      scanned: rows.length,
      marked: 0,
      cleared: 0,
      unchanged: 0,
    };

    const tx = this.db.transaction(() => {
      for (const row of rows) {
        const id = `${row.group_id}:${row.entry_key}`;
        const target = duplicateMap.get(id);
        const isDuplicate = target != null;
        const wasDuplicate =
          row.status === 'duplicate' &&
          row.duplicate_group_id != null &&
          row.duplicate_key != null;
        const sameTarget =
          wasDuplicate &&
          isDuplicate &&
          row.duplicate_group_id === target.groupId &&
          row.duplicate_key === target.key;

        if (isDuplicate) {
          if (sameTarget) {
            result.unchanged += 1;
          } else {
            markDuplicate.run(target.groupId, target.key, row.group_id, row.entry_key);
            result.marked += 1;
          }
        } else if (wasDuplicate) {
          clearDuplicate.run(row.group_id, row.entry_key);
          result.cleared += 1;
        } else {
          result.unchanged += 1;
        }
      }
    });

    tx();
    return result;
  }

  getArticleStatsByYear(versao?: string): GroupArticleStats[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (versao) {
      conditions.push('g.versao = ?');
      params.push(versao);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = this.db
      .prepare(
        `SELECT
          g.id AS group_id,
          g.title AS group_title,
          g.versao AS versao,
          CAST(COALESCE(NULLIF(json_extract(a.fields_json, '$.year'), ''), '0') AS INTEGER) AS year,
          SUM(CASE WHEN a.usado = 1 THEN 1 ELSE 0 END) AS usados,
          SUM(CASE WHEN a.usado = 0 AND a.descartado = 1 THEN 1 ELSE 0 END) AS descartados,
          SUM(CASE WHEN a.usado = 0 AND a.descartado = 0 THEN 1 ELSE 0 END) AS outros,
          SUM(CASE WHEN a.status = 'duplicate' THEN 1 ELSE 0 END) AS repetidos,
          SUM(CASE WHEN a.status != 'duplicate' THEN 1 ELSE 0 END) AS unicos
        FROM groups g
        JOIN articles a ON a.group_id = g.id
        ${whereClause}
        GROUP BY g.id, year
        HAVING year > 0
        ORDER BY g.title ASC, year ASC`,
      )
      .all(...params) as Array<{
      group_id: number;
      group_title: string;
      versao: string;
      year: number;
      usados: number;
      descartados: number;
      outros: number;
      repetidos: number;
      unicos: number;
    }>;

    const byGroup = new Map<number, GroupArticleStats>();
    for (const row of rows) {
      let group = byGroup.get(row.group_id);
      if (!group) {
        group = {
          groupId: row.group_id,
          groupTitle: row.group_title,
          versao: row.versao,
          series: [],
        };
        byGroup.set(row.group_id, group);
      }
      group.series.push({
        year: row.year,
        usados: row.usados,
        descartados: row.descartados,
        outros: row.outros,
        repetidos: row.repetidos,
        unicos: row.unicos,
      });
    }

    if (versao) {
      return [...byGroup.values()];
    }

    const emptyGroups = this.db
      .prepare(
        `SELECT g.id AS group_id, g.title AS group_title, g.versao AS versao
         FROM groups g
         WHERE NOT EXISTS (
           SELECT 1 FROM articles a
           WHERE a.group_id = g.id
             AND CAST(COALESCE(NULLIF(json_extract(a.fields_json, '$.year'), ''), '0') AS INTEGER) > 0
         )
         ORDER BY g.title ASC`,
      )
      .all() as Array<{ group_id: number; group_title: string; versao: string }>;

    for (const row of emptyGroups) {
      if (!byGroup.has(row.group_id)) {
        byGroup.set(row.group_id, {
          groupId: row.group_id,
          groupTitle: row.group_title,
          versao: row.versao,
          series: [],
        });
      }
    }

    return [...byGroup.values()].sort((a, b) =>
      a.groupTitle.localeCompare(b.groupTitle, 'pt-BR', { sensitivity: 'base' }),
    );
  }

  async cleanAuthorFields(): Promise<{ updated: number }> {
    let updated = 0;
    const rows = this.db
      .prepare(`SELECT id, fields_json FROM articles WHERE fields_json LIKE '%author%'`)
      .all() as Array<{ id: number; fields_json: string }>;
    const update = this.db.prepare('UPDATE articles SET fields_json = ? WHERE id = ?');

    const tx = this.db.transaction(() => {
      for (const row of rows) {
        const fields = JSON.parse(row.fields_json) as Record<string, string>;
        const author = fields.author;
        if (!author) continue;
        const cleaned = normalizeAuthorField(author);
        if (cleaned !== author) {
          fields.author = cleaned;
          update.run(JSON.stringify(fields), row.id);
          updated += 1;
        }
      }
    });
    tx();
    return { updated };
  }
}
