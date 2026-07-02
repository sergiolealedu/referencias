import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

import type {
  Article,
  ArticleListParams,
  GroupMeta,
  GroupSummary,
  PaginatedArticles,
  PaginatedSearchResults,
  SearchResult,
  SortColumn,
} from '../types/referencias';
import { articleToRowValues, ftsQuery, rowToArticle, type ArticleRow } from './articleMapper';
import { LOCAL_SCHEMA_SQL } from './localSchema';

const DB_NAME = 'referencias_local';
const SORT_COLUMN_SQL: Record<SortColumn, string> = {
  title: "COALESCE(json_extract(fields_json, '$.title'), entry_key)",
  author: "COALESCE(json_extract(fields_json, '$.author'), '')",
  year: "CAST(COALESCE(NULLIF(json_extract(fields_json, '$.year'), ''), '0') AS INTEGER)",
  status: 'status',
  tags: 'tags_json',
  usado: 'usado',
  descartado: 'descartado',
};

function buildArticleFilters(filters: ArticleListParams, alias = 'a'): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    conditions.push(`${alias}.status = ?`);
    params.push(filters.status);
  }
  if (filters.usado !== undefined && filters.usado !== '') {
    conditions.push(`${alias}.usado = ?`);
    params.push(filters.usado === 'true' ? 1 : 0);
  }
  if (filters.descartado !== undefined && filters.descartado !== '') {
    conditions.push(`${alias}.descartado = ?`);
    params.push(filters.descartado === 'true' ? 1 : 0);
  }
  if (filters.tags) {
    const tagList = filters.tags.split(';').filter(Boolean);
    if (tagList.length > 0) {
      const placeholders = tagList.map(() => '?').join(', ');
      conditions.push(
        `(SELECT COUNT(DISTINCT je.value) FROM json_each(${alias}.tags_json) je WHERE je.value IN (${placeholders})) = ?`,
      );
      params.push(...tagList, tagList.length);
    }
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

function normalizeListParams(params: ArticleListParams = {}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));
  return {
    filters: params,
    page,
    pageSize,
    sortBy: params.sortBy,
    sortDir: params.sortDir ?? 'asc',
    findKey: params.findKey,
  };
}

interface GroupRow {
  id: number;
  title: string;
  versao: string;
  mecanismo: string;
  string_busca: string;
  created_at: string;
  article_count: number;
}

export class LocalSqliteStore {
  private db: SQLiteDBConnection | null = null;
  private sqlite = new SQLiteConnection(CapacitorSQLite);

  async init(): Promise<void> {
    if (this.db) return;

    const consistency = await this.sqlite.checkConnectionsConsistency();
    const isConn = (consistency.result ?? false) && (await this.sqlite.isConnection(DB_NAME, false)).result;

    if (isConn) {
      this.db = await this.sqlite.retrieveConnection(DB_NAME, false);
    } else {
      this.db = await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
      await this.db.open();
      await this.db.execute(LOCAL_SCHEMA_SQL);
    }
  }

  private connection(): SQLiteDBConnection {
    if (!this.db) throw new Error('LocalSqliteStore não inicializado');
    return this.db;
  }

  async getSyncMeta(key: string): Promise<string | null> {
    const result = await this.connection().query(
      'SELECT value FROM sync_meta WHERE key = ?',
      [key],
    );
    return (result.values?.[0] as { value: string } | undefined)?.value ?? null;
  }

  async setSyncMeta(key: string, value: string): Promise<void> {
    await this.connection().run(
      'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
      [key, value],
    );
  }

  async listGroups(): Promise<GroupSummary[]> {
    const result = await this.connection().query(
      `SELECT g.*, (SELECT COUNT(*) FROM articles a WHERE a.group_id = g.id) AS article_count
       FROM groups g ORDER BY g.title`,
    );
    return ((result.values ?? []) as GroupRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      versao: row.versao,
      mecanismo: row.mecanismo,
      stringBusca: row.string_busca,
      createdAt: row.created_at,
      articleCount: row.article_count,
    }));
  }

  async getGroup(groupId: number): Promise<GroupMeta> {
    const result = await this.connection().query(
      `SELECT g.*, (SELECT COUNT(*) FROM articles a WHERE a.group_id = g.id) AS article_count
       FROM groups g WHERE g.id = ?`,
      [groupId],
    );
    const row = result.values?.[0] as GroupRow | undefined;
    if (!row) throw new Error(`Grupo ${groupId} não encontrado`);
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

  async listArticles(groupId: number, params: ArticleListParams = {}): Promise<PaginatedArticles> {
    const { filters, page, pageSize, sortBy, sortDir, findKey } = normalizeListParams(params);
    const { sql: filterSql, params: filterParams } = buildArticleFilters(filters);
    const whereBase = `a.group_id = ?${filterSql}`;
    const baseParams = [groupId, ...filterParams];

    const countResult = await this.connection().query(
      `SELECT COUNT(*) AS total FROM articles a WHERE ${whereBase}`,
      baseParams,
    );
    const total = (countResult.values?.[0] as { total: number }).total;

    let effectivePage = page;
    let foundPage: number | undefined;

    if (findKey) {
      const order = orderByClause(sortBy, sortDir);
      const rankResult = await this.connection().query(
        `WITH ranked AS (
           SELECT entry_key, ROW_NUMBER() OVER (ORDER BY ${order}) AS rn
           FROM articles a WHERE ${whereBase}
         )
         SELECT rn FROM ranked WHERE entry_key = ?`,
        [...baseParams, findKey],
      );
      const rankRow = rankResult.values?.[0] as { rn: number } | undefined;
      if (rankRow) {
        foundPage = Math.floor((rankRow.rn - 1) / pageSize) + 1;
        effectivePage = foundPage;
      }
    }

    const order = orderByClause(sortBy, sortDir);
    const offset = (effectivePage - 1) * pageSize;
    const rowsResult = await this.connection().query(
      `SELECT * FROM articles a WHERE ${whereBase} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...baseParams, pageSize, offset],
    );
    const rows = (rowsResult.values ?? []) as ArticleRow[];

    return {
      items: rows.map(rowToArticle),
      total,
      page: effectivePage,
      pageSize,
      ...(foundPage !== undefined ? { foundPage } : {}),
    };
  }

  async getArticle(groupId: number, key: string): Promise<Article> {
    const result = await this.connection().query(
      'SELECT * FROM articles WHERE group_id = ? AND entry_key = ?',
      [groupId, key],
    );
    const row = result.values?.[0] as ArticleRow | undefined;
    if (!row) throw new Error(`Artigo "${key}" não encontrado`);
    return rowToArticle(row);
  }

  async updateArticle(
    groupId: number,
    key: string,
    patch: Partial<Article> & { entry?: Partial<Article['entry']> },
  ): Promise<Article> {
    const current = await this.getArticle(groupId, key);
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
    const now = new Date().toISOString();
    await this.connection().run(
      `UPDATE articles SET
        entry_key = ?, entry_type = ?, fields_json = ?, status = ?, source = ?,
        location = ?, caminho = ?, notes = ?, tags_json = ?, descartado = ?,
        usado = ?, duplicate_group_id = ?, duplicate_key = ?, updated_at = ?
       WHERE group_id = ? AND entry_key = ?`,
      [
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
        now,
        groupId,
        key,
      ],
    );
    return structuredClone(merged);
  }

  async searchArticles(params: ArticleListParams = {}): Promise<PaginatedSearchResults> {
    const { filters, page, pageSize, sortBy, sortDir } = normalizeListParams(params);
    const { sql: filterSql, params: filterParams } = buildArticleFilters(filters);
    const whereBase = `1=1${filterSql}`;
    const baseParams = [...filterParams];

    const countResult = await this.connection().query(
      `SELECT COUNT(*) AS total FROM articles a WHERE ${whereBase}`,
      baseParams,
    );
    const total = (countResult.values?.[0] as { total: number }).total;

    const order = orderByClause(sortBy, sortDir);
    const offset = (page - 1) * pageSize;
    const rowsResult = await this.connection().query(
      `SELECT a.*, g.title AS group_title FROM articles a
       JOIN groups g ON g.id = a.group_id
       WHERE ${whereBase}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`,
      [...baseParams, pageSize, offset],
    );

    const items: SearchResult[] = ((rowsResult.values ?? []) as (ArticleRow & { group_title: string })[]).map(
      (row) => ({
        groupId: row.group_id,
        groupTitle: row.group_title,
        article: rowToArticle(row),
      }),
    );

    return { items, total, page, pageSize };
  }

  async getMobileStats(): Promise<{ total: number; usados: number; descartados: number; pendentes: number }> {
    const result = await this.connection().query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN usado = 1 THEN 1 ELSE 0 END) AS usados,
         SUM(CASE WHEN descartado = 1 THEN 1 ELSE 0 END) AS descartados,
         SUM(CASE WHEN usado = 0 AND descartado = 0 THEN 1 ELSE 0 END) AS pendentes
       FROM articles`,
    );
    const row = result.values?.[0] as {
      total: number;
      usados: number;
      descartados: number;
      pendentes: number;
    };
    return {
      total: row?.total ?? 0,
      usados: row?.usados ?? 0,
      descartados: row?.descartados ?? 0,
      pendentes: row?.pendentes ?? 0,
    };
  }

  async upsertGroup(group: {
    id: number;
    title: string;
    versao: string;
    mecanismo: string;
    stringBusca: string;
    createdAt: string;
    updatedAt: string;
  }): Promise<void> {
    await this.connection().run(
      `INSERT OR REPLACE INTO groups (id, title, versao, mecanismo, string_busca, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        group.id,
        group.title,
        group.versao,
        group.mecanismo,
        group.stringBusca,
        group.createdAt,
        group.updatedAt,
      ],
    );
  }

  async upsertArticle(groupId: number, article: Article, updatedAt: string): Promise<void> {
    const values = articleToRowValues(groupId, article);
    const existing = await this.connection().query(
      'SELECT id FROM articles WHERE group_id = ? AND entry_key = ?',
      [groupId, values.entry_key],
    );
    if (existing.values?.length) {
      await this.connection().run(
        `UPDATE articles SET
          entry_type = ?, fields_json = ?, status = ?, source = ?, location = ?,
          caminho = ?, notes = ?, tags_json = ?, descartado = ?, usado = ?,
          duplicate_group_id = ?, duplicate_key = ?, updated_at = ?
         WHERE group_id = ? AND entry_key = ?`,
        [
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
          updatedAt,
          groupId,
          values.entry_key,
        ],
      );
    } else {
      await this.connection().run(
        `INSERT INTO articles (
          group_id, entry_key, entry_type, fields_json, status, source, location,
          caminho, notes, tags_json, descartado, usado, duplicate_group_id, duplicate_key, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
          updatedAt,
        ],
      );
    }
  }

  async clearAllData(): Promise<void> {
    await this.connection().run('DELETE FROM articles');
    await this.connection().run('DELETE FROM groups');
    await this.connection().run('DELETE FROM pending_changes');
  }

  async enqueueChange(
    entityType: string,
    entityId: string,
    operation: string,
    payload: unknown,
  ): Promise<void> {
    await this.connection().run(
      'INSERT INTO pending_changes (entity_type, entity_id, operation, payload_json) VALUES (?, ?, ?, ?)',
      [entityType, entityId, operation, JSON.stringify(payload)],
    );
  }

  async listPendingChanges(): Promise<
    Array<{ id: number; entityType: string; entityId: string; operation: string; payload: unknown }>
  > {
    const result = await this.connection().query(
      'SELECT id, entity_type, entity_id, operation, payload_json FROM pending_changes ORDER BY id',
    );
    return (result.values ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as number,
      entityType: row.entity_type as string,
      entityId: row.entity_id as string,
      operation: row.operation as string,
      payload: JSON.parse(row.payload_json as string),
    }));
  }

  async removePendingChanges(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    await this.connection().run(`DELETE FROM pending_changes WHERE id IN (${placeholders})`, ids);
  }

  async pendingChangesCount(): Promise<number> {
    const result = await this.connection().query('SELECT COUNT(*) AS c FROM pending_changes');
    return (result.values?.[0] as { c: number }).c;
  }
}

let storeInstance: LocalSqliteStore | null = null;

export async function getLocalStore(): Promise<LocalSqliteStore> {
  if (!storeInstance) {
    storeInstance = new LocalSqliteStore();
    await storeInstance.init();
  }
  return storeInstance;
}
