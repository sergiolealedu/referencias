import {
  getAuthToken,
  getLegacyDeviceId,
  setAuthToken,
  setLegacyDeviceId,
} from '../utils/device';
import { getApiBase } from '../platform/serverUrl';
import { isNativePlatform } from '../platform/native';

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

async function authHeaders(): Promise<HeadersInit> {
  const authToken = await getAuthToken();
  if (authToken) {
    return { 'X-Auth-Token': authToken };
  }

  const legacyDeviceId = await getLegacyDeviceId();
  if (legacyDeviceId) {
    return { 'X-Device-Id': legacyDeviceId };
  }

  return {};
}

async function persistSession(session: DeviceSession): Promise<DeviceSession> {
  await setAuthToken(session.authToken);
  await setLegacyDeviceId(session.device.id);
  return session;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Erro ${response.status}`;
    let needsOnboarding = false;
    try {
      const body = (await response.json()) as {
        error?: string;
        needsOnboarding?: boolean;
        parseErrors?: Array<{ key: string; type: string; reason: string }>;
      };
      if (body.error) message = body.error;
      if (body.needsOnboarding) needsOnboarding = true;
      if (body.parseErrors?.length) {
        const details = body.parseErrors
          .map((e) => `${e.key} (@${e.type}): ${e.reason}`)
          .join('\n');
        message += `\n\n${details}`;
      }
    } catch {
      // ignore
    }
    const error = new Error(message) as Error & { needsOnboarding?: boolean };
    error.needsOnboarding = needsOnboarding;
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function toQuery(params: ArticleListParams): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.tags) search.set('tags', params.tags);
  if (params.status) search.set('status', params.status);
  if (params.usado) search.set('usado', params.usado);
  if (params.descartado) search.set('descartado', params.descartado);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortDir) search.set('sortDir', params.sortDir);
  if (params.findKey) search.set('findKey', params.findKey);
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const remoteApi = {
  registerDevice: async () => {
    const legacyDeviceId = await getLegacyDeviceId();
    const session = await request<DeviceSession>('/device/register', {
      method: 'POST',
      body: JSON.stringify(legacyDeviceId ? { deviceId: legacyDeviceId } : {}),
    });
    return persistSession(session);
  },

  getDeviceSession: async () => {
    const session = await request<DeviceSession>('/device/session');
    return persistSession(session);
  },

  listGroups: () => request<GroupSummary[]>('/groups'),

  listUsadoArticles: () => request<SearchResult[]>('/groups/usado-articles'),

  getGroup: (id: number) => request<GroupMeta>(`/groups/${id}`),

  listGroupTags: (groupId: number) => request<string[]>(`/groups/${groupId}/tags`),

  createGroup: (input: GroupInput) =>
    request<GroupMeta>('/groups', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateGroup: (id: number, data: GroupInput) =>
    request<GroupMeta>(`/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteGroup: (id: number) => request<void>(`/groups/${id}`, { method: 'DELETE' }),

  listArticles: (groupId: number, params: ArticleListParams = {}) =>
    request<PaginatedArticles>(`/groups/${groupId}/articles${toQuery(params)}`),

  exportArticles: (groupId: number, keys: string[]) =>
    request<Article[]>(`/groups/${groupId}/articles/export`, {
      method: 'POST',
      body: JSON.stringify({ keys }),
    }),

  getArticle: (groupId: number, key: string) =>
    request<Article>(`/groups/${groupId}/articles/${encodeURIComponent(key)}`),

  createArticle: (groupId: number, article: Article) =>
    request<Article>(`/groups/${groupId}/articles`, {
      method: 'POST',
      body: JSON.stringify(article),
    }),

  updateArticle: (groupId: number, key: string, patch: Partial<Article>) =>
    request<Article>(`/groups/${groupId}/articles/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteArticle: (groupId: number, key: string) =>
    request<void>(`/groups/${groupId}/articles/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    }),

  clearGroupArticles: (groupId: number) =>
    request<{ deleted: number }>(`/groups/${groupId}/articles`, {
      method: 'DELETE',
    }),

  search: (params: ArticleListParams = {}) =>
    request<PaginatedSearchResults>(`/search${toQuery(params)}`),

  pdfUrl: async (filePath: string) => {
    const base = await getApiBase();
    return `${base}/files/pdf?path=${encodeURIComponent(filePath.trim())}`;
  },

  importBibtex: (groupId: number, input: BibtexImportInput) =>
    request<BibtexImportResult>(`/groups/${groupId}/import/bibtex`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getSettings: () => request<AppSettings>('/settings'),

  getArticleStatsByYear: (versao?: string) => {
    const qs = versao ? `?versao=${encodeURIComponent(versao)}` : '';
    return request<GroupArticleStats[]>(`/stats/articles-by-year${qs}`);
  },

  detectDuplicates: (versao = 'v2') =>
    request<DuplicateDetectionResult>(`/stats/detect-duplicates?versao=${encodeURIComponent(versao)}`, {
      method: 'POST',
    }),

  getStatusActivity: (params: { from: string; to: string; versao?: string }) => {
    const qs = new URLSearchParams({ from: params.from, to: params.to });
    if (params.versao) qs.set('versao', params.versao);
    return request<import('../types/referencias').DayStatusActivity[]>(`/stats/status-activity?${qs}`);
  },

  recordArticleLoaded: (groupId: number, key: string) =>
    request<Article>(`/groups/${groupId}/articles/${encodeURIComponent(key)}/loaded`, {
      method: 'POST',
    }),

  updateSettings: (settings: Pick<AppSettings, 'sqliteDbPath'> & Partial<AppSettings>) =>
    request<AppSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  listWorkspaces: () => request<WorkspaceSummary[]>('/workspaces'),

  getActiveWorkspace: () => request<WorkspaceSummary>('/workspaces/active'),

  createWorkspace: (input: WorkspaceInput) =>
    request<WorkspaceSummary>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  joinWorkspace: (token: string) =>
    request<WorkspaceSummary>('/workspaces/join', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  updateWorkspace: (id: string, input: Partial<WorkspaceInput>) =>
    request<WorkspaceSummary>(`/workspaces/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  leaveWorkspace: (id: string) =>
    request<void>(`/workspaces/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  activateWorkspace: (id: string) =>
    request<WorkspaceSummary>(`/workspaces/${encodeURIComponent(id)}/activate`, {
      method: 'POST',
    }),

  createJoinToken: (workspaceId: string) =>
    request<JoinTokenInfo>(`/workspaces/${encodeURIComponent(workspaceId)}/tokens`, {
      method: 'POST',
    }),

  listJoinTokens: (workspaceId: string) =>
    request<JoinTokenInfo[]>(`/workspaces/${encodeURIComponent(workspaceId)}/tokens`),

  revokeJoinToken: (workspaceId: string, token: string) =>
    request<void>(
      `/workspaces/${encodeURIComponent(workspaceId)}/tokens/${encodeURIComponent(token)}`,
      { method: 'DELETE' },
    ),

  getSyncStatus: () =>
    request<{ lastUpdatedAt: string | null; workspaceId: string; workspaceName: string }>(
      '/sync/status',
    ),

  syncPull: (since?: string) => {
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    return request<import('../sync/types').SyncPullResult>(`/sync/pull${qs}`);
  },

  syncPush: (changes: import('../sync/types').SyncChange[]) =>
    request<import('../sync/types').SyncPushResult>('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ changes }),
    }),
};

/** @deprecated use remoteApi or dataProvider */
export const api = remoteApi;

export async function resolvePdfUrl(filePath: string): Promise<string> {
  if (isNativePlatform()) {
    const { getCachedPdfUri } = await import('../pdf/pdfCache');
    const cached = await getCachedPdfUri(filePath);
    if (cached) return cached;
  }
  return remoteApi.pdfUrl(filePath);
}
