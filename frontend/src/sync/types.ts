import type { Article } from '../types/referencias';

export interface SyncGroup {
  id: number;
  title: string;
  versao: string;
  mecanismo: string;
  stringBusca: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncArticle {
  groupId: number;
  article: Article;
  updatedAt: string;
}

export interface SyncPullResult {
  groups: SyncGroup[];
  articles: SyncArticle[];
  deletedArticles: Array<{ groupId: number; entryKey: string }>;
  serverTime: string;
}

export interface SyncChange {
  entityType: 'article';
  operation: 'update';
  groupId: number;
  entryKey: string;
  patch: Partial<Article>;
  clientUpdatedAt: string;
}

export interface SyncPushResult {
  applied: number;
  appliedKeys: string[];
  conflicts: Array<{
    groupId: number;
    entryKey: string;
    reason: string;
  }>;
  serverTime: string;
}

export interface SyncState {
  lastSyncAt: string | null;
  pendingCount: number;
  isOnline: boolean;
  isSyncing: boolean;
  lastError: string | null;
  lastConflicts: SyncPushResult['conflicts'];
}
