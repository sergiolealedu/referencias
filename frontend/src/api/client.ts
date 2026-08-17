import {
  getAuthToken,
  getLegacyDeviceId,
  setAuthToken,
  setLegacyDeviceId,
} from '../utils/device';

import type {
  AppSettings,
  Article,
  ArticleFactorInput,
  ArticleListParams,
  BibtexImportInput,
  BibtexImportResult,
  DuplicateDetectionResult,
  GroupArticleStats,
  AbstractsExport,
  GroupExport,
  MarcarUsadosResult,
  GroupImportOptions,
  GroupImportResult,
  GroupInput,
  FactorDefinition,
  FactorsImportResult,
  FactorsAnalysisExport,
  FactorsDelta,
  FactorsDeltaResult,
  FactorOverview,
  GroupMeta,
  GroupSummary,
  PaginatedArticles,
  PaginatedSearchResults,
  SearchResult,
} from '../types/referencias';

type ArticleWritePayload = Omit<Article, 'factors'> & {
  factors?: ArticleFactorInput[];
};
import type { DeviceSession, JoinTokenInfo } from '../types/device';
import type { WorkspaceInput, WorkspaceSummary, AccessSetup } from '../types/workspace';
import { resolveApiBaseUrl } from '../utils/platform';

function getApiBase(): string {
  return resolveApiBaseUrl();
}

/** Deve acompanhar MAX_PDF_BYTES no backend e o client_max_body_size do nginx. */
export const MAX_PDF_UPLOAD_MB = 50;
const MAX_PDF_UPLOAD_BYTES = MAX_PDF_UPLOAD_MB * 1024 * 1024;

function authHeaders(): HeadersInit {
  const authToken = getAuthToken();
  if (authToken) {
    return { 'X-Auth-Token': authToken };
  }

  const legacyDeviceId = getLegacyDeviceId();
  if (legacyDeviceId) {
    return { 'X-Device-Id': legacyDeviceId };
  }

  return {};
}

function persistSession(session: DeviceSession): DeviceSession {
  setAuthToken(session.authToken);
  setLegacyDeviceId(session.device.id);
  return session;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
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
  if (params.categoria) search.set('categoria', params.categoria);
  if (params.usado) search.set('usado', params.usado);
  if (params.descartado) search.set('descartado', params.descartado);
  if (params.revisaoLiteratura) search.set('revisaoLiteratura', params.revisaoLiteratura);
  if (params.pdfNaoEncontrado) search.set('pdfNaoEncontrado', params.pdfNaoEncontrado);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortDir) search.set('sortDir', params.sortDir);
  if (params.findKey) search.set('findKey', params.findKey);
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  registerDevice: async () => {
    const legacyDeviceId = getLegacyDeviceId();
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

  listFactors: () => request<FactorDefinition[]>('/factors'),

  listFactorOverviews: () => request<FactorOverview[]>('/factors/overview'),

  importFactors: (factors: FactorDefinition[]) =>
    request<FactorsImportResult>('/factors/import', {
      method: 'POST',
      body: JSON.stringify({ factors }),
    }),

  /** Sem groupId/key, traz o lote de usados; com eles, só aquele artigo. */
  exportAnaliseFatores: (alvo?: { groupId: number; key: string }) => {
    const qs = alvo
      ? `?groupId=${alvo.groupId}&key=${encodeURIComponent(alvo.key)}`
      : '';
    return request<FactorsAnalysisExport>(`/factors/export-analise${qs}`);
  },

  deleteFactor: (id: string, cascata = false) =>
    request<{ ocorrenciasRemovidas: number }>(
      `/factors/${encodeURIComponent(id)}${cascata ? '?cascata=true' : ''}`,
      { method: 'DELETE' },
    ),

  removeFactorFromArticle: (factorId: string, groupId: number, key: string) =>
    request<Article>(
      `/factors/${encodeURIComponent(factorId)}/ocorrencia?groupId=${groupId}&key=${encodeURIComponent(key)}`,
      { method: 'DELETE' },
    ),

  applyFactorsDelta: (delta: FactorsDelta) =>
    request<FactorsDeltaResult>('/factors/apply-delta', {
      method: 'POST',
      body: JSON.stringify(delta),
    }),

  ensureFactor: (input: { id?: string; name: string; aliases?: string[] }) =>
    request<FactorDefinition>('/factors', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateFactor: (
    id: string,
    patch: { name?: string; aliases?: string[]; spellings?: string[] },
  ) =>
    request<FactorDefinition>(`/factors/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

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

  deleteGroup: (id: number) =>
    request<void>(`/groups/${id}`, { method: 'DELETE' }),

  exportGroup: (id: number) => request<GroupExport>(`/groups/${id}/export`),

  exportGroupAbstractsNaoUsados: (id: number) =>
    request<AbstractsExport>(`/groups/${id}/abstracts-nao-usados`),

  marcarArtigosComoUsados: (groupId: number, keys: string[]) =>
    request<MarcarUsadosResult>(`/groups/${groupId}/articles/marcar-usados`, {
      method: 'POST',
      body: JSON.stringify({ keys }),
    }),

  importGroup: (payload: GroupExport, options?: GroupImportOptions) =>
    request<GroupImportResult>('/groups/import', {
      method: 'POST',
      body: JSON.stringify({ ...payload, options }),
    }),

  listArticles: (groupId: number, params: ArticleListParams = {}) =>
    request<PaginatedArticles>(`/groups/${groupId}/articles${toQuery(params)}`),

  exportArticles: (groupId: number, keys: string[]) =>
    request<Article[]>(`/groups/${groupId}/articles/export`, {
      method: 'POST',
      body: JSON.stringify({ keys }),
    }),

  getArticle: (groupId: number, key: string) =>
    request<Article>(`/groups/${groupId}/articles/${encodeURIComponent(key)}`),

  createArticle: (groupId: number, article: ArticleWritePayload) =>
    request<Article>(`/groups/${groupId}/articles`, {
      method: 'POST',
      body: JSON.stringify(article),
    }),

  updateArticle: (
    groupId: number,
    key: string,
    patch: Partial<Omit<Article, 'factors'>> & { factors?: ArticleFactorInput[] },
  ) =>
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

  pdfUrl: (filePath: string) =>
    `${getApiBase()}/files/pdf?path=${encodeURIComponent(filePath.trim())}`,

  /**
   * Link temporário assinado que abre o PDF sem exigir o header de
   * autenticação — é o que dá para colar no navegador ou compartilhar.
   */
  createPdfShareLink: async (filePath: string) => {
    const { path, expiresAt } = await request<{ path: string; expiresAt: string }>(
      '/files/share-link',
      { method: 'POST', body: JSON.stringify({ path: filePath }) },
    );
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    // Em app nativo a base já é absoluta; na web o caminho vira URL completa.
    const base = getApiBase();
    const url = /^https?:\/\//i.test(base)
      ? `${base.replace(/\/api$/, '')}${path}`
      : `${origin}${path}`;
    return { url, expiresAt };
  },

  openPdf: async (filePath: string) => {
    const response = await fetch(api.pdfUrl(filePath), {
      headers: { ...authHeaders() },
    });
    if (!response.ok) {
      let message = `Erro ${response.status}`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // ignore
      }
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  uploadArticlePdf: async (groupId: number, key: string, file: File) => {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);

    // Recusa antes de enviar: acima do limite o upload é cortado no meio do
    // caminho (nginx/Cloudflare fecham a conexão) e o erro chegava confuso ou
    // simplesmente não chegava.
    if (file.size > MAX_PDF_UPLOAD_BYTES) {
      throw new Error(
        `PDF de ${sizeMb} MB excede o limite de ${MAX_PDF_UPLOAD_MB} MB. ` +
          'Comprima o arquivo (ex.: reduzir resolução das imagens) e envie de novo.',
      );
    }

    let response: Response;
    try {
      response = await fetch(
        `${getApiBase()}/groups/${groupId}/articles/${encodeURIComponent(key)}/pdf`,
        {
          method: 'POST',
          headers: {
            ...authHeaders(),
            'Content-Type': 'application/pdf',
          },
          body: file,
        },
      );
    } catch (error) {
      // Falha de rede: a requisição nem chegou a ter resposta (conexão cortada
      // no meio do upload, offline, proxy fechando a conexão...).
      throw new Error(
        `Falha de rede ao enviar o PDF (${sizeMb} MB): ${(error as Error).message}`,
      );
    }

    if (!response.ok) {
      // O corpo pode não ser JSON (ex.: página de erro do nginx/Cloudflare),
      // então preserva o status para não sumir com a causa real.
      let detail = '';
      try {
        const raw = await response.text();
        try {
          const body = JSON.parse(raw) as { error?: string };
          detail = body.error ?? raw.slice(0, 200);
        } catch {
          detail = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
        }
      } catch {
        // corpo ilegível — segue só com o status
      }

      if (response.status === 413) {
        throw new Error(
          `PDF recusado por ser grande demais (${sizeMb} MB) — HTTP 413. Limite do servidor.`,
        );
      }
      throw new Error(
        `Erro ${response.status} ao enviar o PDF (${sizeMb} MB)${detail ? `: ${detail}` : ''}`,
      );
    }
    return response.json() as Promise<Article>;
  },

  deleteArticlePdf: (groupId: number, key: string) =>
    request<Article>(`/groups/${groupId}/articles/${encodeURIComponent(key)}/pdf`, {
      method: 'DELETE',
    }),

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

  updateSettings: (settings: Pick<AppSettings, 'sqliteDbPath'> & Partial<AppSettings>) =>
    request<AppSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  listWorkspaces: () => request<WorkspaceSummary[]>('/workspaces'),

  getAccessSetup: () => request<AccessSetup>('/workspaces/setup'),

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
};
