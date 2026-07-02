import { Router } from 'express';

import type { AuthenticatedRequest } from '../middleware/deviceAuth.js';
import { rowToArticle } from '../store/articleMapper.js';
import type { ArticleRow } from '../store/articleMapper.js';
import type { Article } from '../types/referencias.js';

interface SyncGroupRow {
  id: number;
  title: string;
  versao: string;
  mecanismo: string;
  string_busca: string;
  created_at: string;
  updated_at: string;
}

interface SyncChangeBody {
  entityType: 'article';
  operation: 'update';
  groupId: number;
  entryKey: string;
  patch: Partial<Article>;
  clientUpdatedAt: string;
}

export function createSyncRouter(): Router {
  const router = Router();

  router.get('/status', (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const store = authReq.store;

    const groupMax = store.getDb().prepare(
      'SELECT MAX(updated_at) AS max_updated FROM groups',
    ).get() as { max_updated: string | null };
    const articleMax = store.getDb().prepare(
      'SELECT MAX(updated_at) AS max_updated FROM articles',
    ).get() as { max_updated: string | null };

    const timestamps = [groupMax.max_updated, articleMax.max_updated].filter(Boolean) as string[];
    const lastUpdatedAt =
      timestamps.length > 0
        ? timestamps.reduce((a, b) => (a > b ? a : b))
        : null;

    res.json({
      lastUpdatedAt,
      workspaceId: authReq.activeWorkspace.id,
      workspaceName: authReq.activeWorkspace.name,
    });
  });

  router.get('/pull', (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const store = authReq.store;
    const since = typeof req.query.since === 'string' ? req.query.since : null;
    const serverTime = new Date().toISOString();

    const groupSql = since
      ? 'SELECT * FROM groups WHERE updated_at > ? ORDER BY id'
      : 'SELECT * FROM groups ORDER BY id';
    const groupParams = since ? [since] : [];
    const groups = store.getDb().prepare(groupSql).all(...groupParams) as SyncGroupRow[];

    const articleSql = since
      ? 'SELECT * FROM articles WHERE updated_at > ? ORDER BY group_id, entry_key'
      : 'SELECT * FROM articles ORDER BY group_id, entry_key';
    const articleParams = since ? [since] : [];
    const articleRows = store.getDb().prepare(articleSql).all(...articleParams) as ArticleRow[];

    res.json({
      groups: groups.map((g) => ({
        id: g.id,
        title: g.title,
        versao: g.versao,
        mecanismo: g.mecanismo,
        stringBusca: g.string_busca,
        createdAt: g.created_at,
        updatedAt: g.updated_at,
      })),
      articles: articleRows.map((row) => ({
        groupId: row.group_id,
        article: rowToArticle(row),
        updatedAt: row.updated_at ?? serverTime,
      })),
      deletedArticles: [],
      serverTime,
    });
  });

  router.post('/push', async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const store = authReq.store;
    const body = req.body as { changes?: SyncChangeBody[] };
    const changes = body.changes ?? [];

    let applied = 0;
    const appliedKeys: string[] = [];
    const conflicts: Array<{ groupId: number; entryKey: string; reason: string }> = [];
    const serverTime = new Date().toISOString();

    for (const change of changes) {
      if (change.entityType !== 'article' || change.operation !== 'update') {
        continue;
      }

      try {
        const row = store.getDb().prepare(
          'SELECT updated_at FROM articles WHERE group_id = ? AND entry_key = ?',
        ).get(change.groupId, change.entryKey) as { updated_at: string } | undefined;

        if (row && row.updated_at > change.clientUpdatedAt) {
          conflicts.push({
            groupId: change.groupId,
            entryKey: change.entryKey,
            reason: 'Versão do servidor mais recente',
          });
          continue;
        }

        await store.updateArticle(change.groupId, change.entryKey, change.patch);
        store.getDb().prepare(
          'UPDATE articles SET updated_at = ? WHERE group_id = ? AND entry_key = ?',
        ).run(change.clientUpdatedAt, change.groupId, change.entryKey);

        applied += 1;
        appliedKeys.push(`${change.groupId}:${change.entryKey}`);
      } catch (err) {
        conflicts.push({
          groupId: change.groupId,
          entryKey: change.entryKey,
          reason: (err as Error).message,
        });
      }
    }

    res.json({ applied, appliedKeys, conflicts, serverTime });
  });

  return router;
}
