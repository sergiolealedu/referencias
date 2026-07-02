import { isNativePlatform } from '../platform/native';
import { remoteApi } from './client';
import { getLocalStore } from '../store/LocalSqliteStore';
import { syncEngine } from '../sync/SyncEngine';
import type { SyncChange } from '../sync/types';

import type {
  AppSettings,
  Article,
  ArticleListParams,
  BibtexImportInput,
  BibtexImportResult,
  DuplicateDetectionResult,
  GroupArticleStats,
  GroupInput,
  GroupMeta,
  GroupSummary,
  PaginatedArticles,
  PaginatedSearchResults,
  SearchResult,
} from '../types/referencias';
import type { DeviceSession, JoinTokenInfo } from '../types/device';
import type { WorkspaceInput, WorkspaceSummary } from '../types/workspace';

async function enqueueArticleUpdate(
  groupId: number,
  key: string,
  patch: Partial<Article>,
): Promise<void> {
  const store = await getLocalStore();
  const clientUpdatedAt = new Date().toISOString();
  const change: SyncChange = {
    entityType: 'article',
    operation: 'update',
    groupId,
    entryKey: key,
    patch,
    clientUpdatedAt,
  };
  await store.enqueueChange('article', `${groupId}:${key}`, 'update', change);
  void syncEngine.sync();
}

export const dataProvider = {
  registerDevice: () => remoteApi.registerDevice(),
  getDeviceSession: () => remoteApi.getDeviceSession(),

  listGroups: async (): Promise<GroupSummary[]> => {
    if (isNativePlatform()) {
      const store = await getLocalStore();
      return store.listGroups();
    }
    return remoteApi.listGroups();
  },

  listUsadoArticles: () => remoteApi.listUsadoArticles(),

  getGroup: async (id: number): Promise<GroupMeta> => {
    if (isNativePlatform()) {
      const store = await getLocalStore();
      return store.getGroup(id);
    }
    return remoteApi.getGroup(id);
  },

  listGroupTags: async (groupId: number): Promise<string[]> => {
    if (isNativePlatform()) {
      const result = await dataProvider.listArticles(groupId, { pageSize: 200 });
      const tags = new Set<string>();
      for (const article of result.items) {
        for (const tag of article.tags) tags.add(tag);
      }
      return [...tags].sort();
    }
    return remoteApi.listGroupTags(groupId);
  },

  createGroup: (input: GroupInput) => remoteApi.createGroup(input),
  updateGroup: (id: number, data: GroupInput) => remoteApi.updateGroup(id, data),
  deleteGroup: (id: number) => remoteApi.deleteGroup(id),

  listArticles: async (
    groupId: number,
    params: ArticleListParams = {},
  ): Promise<PaginatedArticles> => {
    if (isNativePlatform()) {
      const store = await getLocalStore();
      return store.listArticles(groupId, params);
    }
    return remoteApi.listArticles(groupId, params);
  },

  exportArticles: (groupId: number, keys: string[]) =>
    remoteApi.exportArticles(groupId, keys),

  getArticle: async (groupId: number, key: string): Promise<Article> => {
    if (isNativePlatform()) {
      const store = await getLocalStore();
      return store.getArticle(groupId, key);
    }
    return remoteApi.getArticle(groupId, key);
  },

  createArticle: (groupId: number, article: Article) =>
    remoteApi.createArticle(groupId, article),

  updateArticle: async (
    groupId: number,
    key: string,
    patch: Partial<Article>,
  ): Promise<Article> => {
    if (isNativePlatform()) {
      const store = await getLocalStore();
      const updated = await store.updateArticle(groupId, key, patch);
      await enqueueArticleUpdate(groupId, key, patch);
      return updated;
    }
    return remoteApi.updateArticle(groupId, key, patch);
  },

  deleteArticle: (groupId: number, key: string) =>
    remoteApi.deleteArticle(groupId, key),

  clearGroupArticles: (groupId: number) => remoteApi.clearGroupArticles(groupId),

  search: async (params: ArticleListParams = {}): Promise<PaginatedSearchResults> => {
    if (isNativePlatform()) {
      const store = await getLocalStore();
      return store.searchArticles(params);
    }
    return remoteApi.search(params);
  },

  getMobileStats: async () => {
    if (isNativePlatform()) {
      const store = await getLocalStore();
      return store.getMobileStats();
    }
    return null;
  },

  importBibtex: (groupId: number, input: BibtexImportInput) =>
    remoteApi.importBibtex(groupId, input),

  getSettings: () => remoteApi.getSettings(),
  getArticleStatsByYear: (versao?: string) => remoteApi.getArticleStatsByYear(versao),
  detectDuplicates: (versao?: string) => remoteApi.detectDuplicates(versao),
  getStatusActivity: (params: { from: string; to: string; versao?: string }) =>
    remoteApi.getStatusActivity(params),
  recordArticleLoaded: (groupId: number, key: string) =>
    remoteApi.recordArticleLoaded(groupId, key),
  updateSettings: (
    settings: Pick<AppSettings, 'sqliteDbPath'> & Partial<AppSettings>,
  ) => remoteApi.updateSettings(settings),

  listWorkspaces: () => remoteApi.listWorkspaces(),
  getActiveWorkspace: () => remoteApi.getActiveWorkspace(),
  createWorkspace: (input: WorkspaceInput) => remoteApi.createWorkspace(input),
  joinWorkspace: async (token: string) => {
    const workspace = await remoteApi.joinWorkspace(token);
    if (isNativePlatform()) {
      await syncEngine.fullPull();
    }
    return workspace;
  },
  updateWorkspace: (id: string, input: Partial<WorkspaceInput>) =>
    remoteApi.updateWorkspace(id, input),
  leaveWorkspace: (id: string) => remoteApi.leaveWorkspace(id),
  activateWorkspace: async (id: string) => {
    const workspace = await remoteApi.activateWorkspace(id);
    if (isNativePlatform()) {
      await syncEngine.fullPull();
    }
    return workspace;
  },
  createJoinToken: (workspaceId: string) => remoteApi.createJoinToken(workspaceId),
  listJoinTokens: (workspaceId: string) => remoteApi.listJoinTokens(workspaceId),
  revokeJoinToken: (workspaceId: string, token: string) =>
    remoteApi.revokeJoinToken(workspaceId, token),

  triggerSync: () => syncEngine.sync(),
  fullPull: () => syncEngine.fullPull(),
};

/** API unificada usada pelos hooks */
export const api = dataProvider;

export type {
  DeviceSession,
  JoinTokenInfo,
  WorkspaceInput,
  WorkspaceSummary,
  BibtexImportResult,
  DuplicateDetectionResult,
  GroupArticleStats,
  PaginatedSearchResults,
  SearchResult,
};
