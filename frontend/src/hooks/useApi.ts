import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import type { Article, ArticleListParams, GroupInput } from '../types/referencias';

export function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: api.listGroups,
  });
}

export function useUsadoArticles(enabled = true) {
  return useQuery({
    queryKey: ['usado-articles'],
    queryFn: api.listUsadoArticles,
    enabled,
  });
}

export function useDetectDuplicates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versao?: string) => api.detectDuplicates(versao),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      queryClient.invalidateQueries({ queryKey: ['article'] });
    },
  });
}

export function useArticleStatsByYear(versao?: string) {
  return useQuery({
    queryKey: ['stats', 'articles-by-year', versao ?? 'all'],
    queryFn: () => api.getArticleStatsByYear(versao),
  });
}

export function useGroup(id: number | null) {
  return useQuery({
    queryKey: ['groups', id],
    queryFn: () => api.getGroup(id!),
    enabled: id !== null,
  });
}

export function useGroupTags(groupId: number | null) {
  return useQuery({
    queryKey: ['group-tags', groupId],
    queryFn: () => api.listGroupTags(groupId!),
    enabled: groupId !== null,
  });
}

export function useArticles(groupId: number | null, params: ArticleListParams) {
  return useQuery({
    queryKey: ['articles', groupId, params],
    queryFn: () => api.listArticles(groupId!, params),
    enabled: groupId !== null,
    placeholderData: (prev) => prev,
  });
}

export function useArticle(groupId: number | null, key: string | null) {
  return useQuery({
    queryKey: ['article', groupId, key],
    queryFn: () => api.getArticle(groupId!, key!),
    enabled: groupId !== null && key !== null,
    staleTime: 0,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GroupInput) => api.createGroup(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['usado-articles'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: GroupInput & { id: number }) =>
      api.updateGroup(id, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['groups', id] });
      queryClient.invalidateQueries({ queryKey: ['usado-articles'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['usado-articles'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useCreateArticle(groupId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (article: Article) => api.createArticle(groupId!, article),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles', groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['group-tags', groupId] });
      queryClient.invalidateQueries({ queryKey: ['usado-articles'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      if (groupId) queryClient.invalidateQueries({ queryKey: ['groups', groupId] });
    },
  });
}

export function useUpdateArticle(groupId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: Partial<Article> }) =>
      api.updateArticle(groupId!, key, patch),
    onSuccess: (data, { key }) => {
      queryClient.invalidateQueries({ queryKey: ['articles', groupId] });
      queryClient.invalidateQueries({ queryKey: ['article', groupId, key] });
      if (data.entry.key !== key) {
        queryClient.invalidateQueries({ queryKey: ['article', groupId, data.entry.key] });
      }
      queryClient.invalidateQueries({ queryKey: ['usado-articles'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      if (groupId) queryClient.invalidateQueries({ queryKey: ['groups', groupId] });
    },
  });
}

export function useDeleteArticle(groupId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.deleteArticle(groupId!, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles', groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['group-tags', groupId] });
      queryClient.invalidateQueries({ queryKey: ['usado-articles'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      if (groupId) queryClient.invalidateQueries({ queryKey: ['groups', groupId] });
    },
  });
}

export function useClearGroupArticles(groupId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearGroupArticles(groupId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles', groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['group-tags', groupId] });
      queryClient.invalidateQueries({ queryKey: ['usado-articles'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      if (groupId) queryClient.invalidateQueries({ queryKey: ['groups', groupId] });
    },
  });
}

export function useImportBibtex(groupId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: import('../types/referencias').BibtexImportInput) =>
      api.importBibtex(groupId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles', groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['group-tags', groupId] });
      queryClient.invalidateQueries({ queryKey: ['usado-articles'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      if (groupId) queryClient.invalidateQueries({ queryKey: ['groups', groupId] });
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Pick<import('../types/referencias').AppSettings, 'sqliteDbPath'> &
      Partial<import('../types/referencias').AppSettings>) =>
      api.updateSettings(settings),
    onSuccess: () => {
      invalidateWorkspaceData(queryClient);
    },
  });
}

function invalidateWorkspaceData(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['settings'] });
  queryClient.invalidateQueries({ queryKey: ['workspaces'] });
  queryClient.invalidateQueries({ queryKey: ['active-workspace'] });
  queryClient.invalidateQueries({ queryKey: ['groups'] });
  queryClient.invalidateQueries({ queryKey: ['usado-articles'] });
  queryClient.invalidateQueries({ queryKey: ['stats'] });
  queryClient.invalidateQueries({ queryKey: ['articles'] });
  queryClient.invalidateQueries({ queryKey: ['article'] });
  queryClient.invalidateQueries({ queryKey: ['group-tags'] });
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: api.listWorkspaces,
  });
}

export function useActiveWorkspace() {
  return useQuery({
    queryKey: ['active-workspace'],
    queryFn: api.getActiveWorkspace,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: import('../types/workspace').WorkspaceInput) => api.createWorkspace(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: import('../types/workspace').WorkspaceInput & { id: string }) =>
      api.updateWorkspace(id, input),
    onSuccess: () => {
      invalidateWorkspaceData(queryClient);
    },
  });
}

export function useLeaveWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.leaveWorkspace(id),
    onSuccess: () => {
      invalidateWorkspaceData(queryClient);
    },
  });
}

export function useJoinWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.joinWorkspace(token),
    onSuccess: () => {
      invalidateWorkspaceData(queryClient);
    },
  });
}

export function useCreateJoinToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => api.createJoinToken(workspaceId),
    onSuccess: (_data, workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ['join-tokens', workspaceId] });
    },
  });
}

export function useJoinTokens(workspaceId: string | null) {
  return useQuery({
    queryKey: ['join-tokens', workspaceId],
    queryFn: () => api.listJoinTokens(workspaceId!),
    enabled: workspaceId !== null,
  });
}

export function useRevokeJoinToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, token }: { workspaceId: string; token: string }) =>
      api.revokeJoinToken(workspaceId, token),
    onSuccess: (_data, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: ['join-tokens', workspaceId] });
    },
  });
}

export function useActivateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.activateWorkspace(id),
    onSuccess: () => {
      invalidateWorkspaceData(queryClient);
    },
  });
}
