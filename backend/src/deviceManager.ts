import { randomUUID } from 'node:crypto';

import { getRegistry } from './registry/registryStore.js';
import type { Device, DeviceSession, JoinTokenInfo } from './types/device.js';
import {
  getWorkspacesConfig,
  listAllWorkspaces,
  type Workspace,
  WorkspaceNotFoundError,
} from './workspaceManager.js';

const LEGACY_WORKSPACE_IDS_KEY = 'legacy_workspace_ids';

function rowToDevice(row: {
  id: string;
  label: string | null;
  created_at: string;
  active_workspace_id: string | null;
}): Device {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.created_at,
    activeWorkspaceId: row.active_workspace_id,
  };
}

function ensureLegacyWorkspaceIds(): string[] {
  const registry = getRegistry();
  const existing = registry.getMeta(LEGACY_WORKSPACE_IDS_KEY);
  if (existing) {
    return JSON.parse(existing) as string[];
  }

  const workspaceIds = getWorkspacesConfig().workspaces.map((ws) => ws.id);
  registry.setMeta(LEGACY_WORKSPACE_IDS_KEY, JSON.stringify(workspaceIds));
  return workspaceIds;
}

function grantLegacyWorkspaces(deviceId: string): string[] {
  const registry = getRegistry();
  const legacyIds = ensureLegacyWorkspaceIds();
  for (const workspaceId of legacyIds) {
    registry.addDeviceToWorkspace(deviceId, workspaceId);
  }
  return legacyIds;
}

function buildSession(deviceId: string, authToken: string): DeviceSession {
  const registry = getRegistry();
  const row = registry.getDevice(deviceId);
  if (!row) {
    throw new DeviceNotFoundError(deviceId);
  }

  const workspaceIds = registry.listDeviceWorkspaceIds(deviceId);
  return {
    device: rowToDevice(row),
    workspaceIds,
    needsOnboarding: workspaceIds.length === 0,
    authToken,
  };
}

export function registerDevice(
  deviceId?: string,
  label: string | null = null,
): DeviceSession {
  const registry = getRegistry();
  const id = deviceId ?? randomUUID();

  let row = registry.getDevice(id);

  if (!row) {
    row = registry.createDevice(id, label);
  }

  // Migração: só navegadores que já tinham ID local (localStorage) recebem
  // acesso automático aos workspaces legados. Dispositivos novos — janela anônima,
  // outro computador — precisam criar workspace ou entrar com token de convite.
  if (deviceId && registry.countDeviceWorkspaces(id) === 0) {
    const granted = grantLegacyWorkspaces(id);
    if (granted.length > 0 && !row.active_workspace_id) {
      registry.setDeviceActiveWorkspace(id, granted[0]);
      row = registry.getDevice(id)!;
    }
  }

  const authToken = registry.ensureAuthToken(id);
  return buildSession(id, authToken);
}

export function getDeviceSession(deviceId: string): DeviceSession | null {
  const registry = getRegistry();
  const row = registry.getDevice(deviceId);
  if (!row) return null;

  const authToken = registry.ensureAuthToken(deviceId);
  return buildSession(deviceId, authToken);
}

export function getDeviceSessionByAuthToken(authToken: string): DeviceSession | null {
  const registry = getRegistry();
  const row = registry.getDeviceByAuthToken(authToken);
  if (!row) return null;

  return buildSession(row.id, authToken);
}

export function resolveDeviceId(req: {
  authToken?: string | null;
  deviceId?: string | null;
}): string {
  if (req.authToken) {
    const session = getDeviceSessionByAuthToken(req.authToken);
    if (session) return session.device.id;
  }
  if (req.deviceId) {
    const session = getDeviceSession(req.deviceId);
    if (session) return session.device.id;
    return registerDevice(req.deviceId).device.id;
  }
  throw new DeviceNotFoundError('unknown');
}

export function requireDeviceSession(deviceId: string): DeviceSession {
  const session = getDeviceSession(deviceId);
  if (!session) {
    throw new DeviceNotFoundError(deviceId);
  }
  return session;
}

export function deviceHasWorkspaceAccess(deviceId: string, workspaceId: string): boolean {
  return getRegistry().hasWorkspaceAccess(deviceId, workspaceId);
}

export function addDeviceToWorkspace(deviceId: string, workspaceId: string): void {
  const config = getWorkspacesConfig();
  if (!config.workspaces.some((ws) => ws.id === workspaceId)) {
    throw new WorkspaceNotFoundError(workspaceId);
  }
  getRegistry().addDeviceToWorkspace(deviceId, workspaceId);
}

export function setDeviceActiveWorkspace(deviceId: string, workspaceId: string): void {
  if (!deviceHasWorkspaceAccess(deviceId, workspaceId)) {
    throw new DeviceAccessDeniedError(workspaceId);
  }
  getRegistry().setDeviceActiveWorkspace(deviceId, workspaceId);
}

export function getDeviceActiveWorkspace(deviceId: string): Workspace {
  const registry = getRegistry();
  const row = registry.getDevice(deviceId);
  if (!row) {
    throw new DeviceNotFoundError(deviceId);
  }

  const workspaceIds = registry.listDeviceWorkspaceIds(deviceId);
  if (workspaceIds.length === 0) {
    throw new DeviceNotAuthenticatedError();
  }

  const activeId = row.active_workspace_id ?? workspaceIds[0];
  const workspace = getWorkspacesConfig().workspaces.find((ws) => ws.id === activeId);
  if (!workspace) {
    throw new WorkspaceNotFoundError(activeId);
  }

  if (!registry.hasWorkspaceAccess(deviceId, workspace.id)) {
    throw new DeviceAccessDeniedError(workspace.id);
  }

  if (row.active_workspace_id !== workspace.id) {
    registry.setDeviceActiveWorkspace(deviceId, workspace.id);
  }

  return structuredClone(workspace);
}

export function listDeviceWorkspaces(deviceId: string): Workspace[] {
  const registry = getRegistry();
  const workspaceIds = new Set(registry.listDeviceWorkspaceIds(deviceId));
  const activeId = registry.getDevice(deviceId)?.active_workspace_id ?? null;

  return getWorkspacesConfig()
    .workspaces.filter((ws) => workspaceIds.has(ws.id))
    .map((ws) => structuredClone(ws))
    .map((ws) => ({ ...ws, _active: ws.id === activeId } as Workspace & { _active?: boolean }));
}

export function createJoinToken(
  deviceId: string,
  workspaceId: string,
): JoinTokenInfo {
  if (!deviceHasWorkspaceAccess(deviceId, workspaceId)) {
    throw new DeviceAccessDeniedError(workspaceId);
  }

  const workspace = getWorkspacesConfig().workspaces.find((ws) => ws.id === workspaceId);
  if (!workspace) {
    throw new WorkspaceNotFoundError(workspaceId);
  }

  const row = getRegistry().createJoinToken(workspaceId, deviceId);
  return {
    token: row.token,
    workspaceId,
    workspaceName: workspace.name,
    createdAt: row.created_at,
  };
}

export function joinWorkspaceWithToken(deviceId: string, token: string): Workspace {
  const registry = getRegistry();
  const joinToken = registry.getJoinToken(token);
  if (!joinToken) {
    throw new InvalidJoinTokenError();
  }

  const workspace = getWorkspacesConfig().workspaces.find(
    (ws) => ws.id === joinToken.workspace_id,
  );
  if (!workspace) {
    throw new WorkspaceNotFoundError(joinToken.workspace_id);
  }

  registry.addDeviceToWorkspace(deviceId, workspace.id);

  const device = registry.getDevice(deviceId);
  if (!device?.active_workspace_id) {
    registry.setDeviceActiveWorkspace(deviceId, workspace.id);
  }

  return structuredClone(workspace);
}

export function listWorkspaceJoinTokens(
  deviceId: string,
  workspaceId: string,
): JoinTokenInfo[] {
  if (!deviceHasWorkspaceAccess(deviceId, workspaceId)) {
    throw new DeviceAccessDeniedError(workspaceId);
  }

  const workspace = getWorkspacesConfig().workspaces.find((ws) => ws.id === workspaceId);
  if (!workspace) {
    throw new WorkspaceNotFoundError(workspaceId);
  }

  return getRegistry()
    .listJoinTokens(workspaceId)
    .map((row) => ({
      token: row.token,
      workspaceId: row.workspace_id,
      workspaceName: workspace.name,
      createdAt: row.created_at,
    }));
}

export function revokeJoinToken(
  deviceId: string,
  workspaceId: string,
  token: string,
): void {
  if (!deviceHasWorkspaceAccess(deviceId, workspaceId)) {
    throw new DeviceAccessDeniedError(workspaceId);
  }

  const revoked = getRegistry().revokeJoinToken(token);
  if (!revoked) {
    throw new InvalidJoinTokenError();
  }
}

export function addDeviceToNewWorkspace(deviceId: string, workspaceId: string): void {
  getRegistry().addDeviceToWorkspace(deviceId, workspaceId);
  getRegistry().setDeviceActiveWorkspace(deviceId, workspaceId);
}

export function leaveWorkspace(deviceId: string, workspaceId: string): void {
  if (!deviceHasWorkspaceAccess(deviceId, workspaceId)) {
    throw new DeviceAccessDeniedError(workspaceId);
  }

  const registry = getRegistry();
  const memberships = registry.listDeviceWorkspaceIds(deviceId);
  if (memberships.length <= 1) {
    throw new Error('Não é possível sair do único workspace deste dispositivo.');
  }

  if (registry.getDevice(deviceId)?.active_workspace_id === workspaceId) {
    const remaining = memberships.filter((id) => id !== workspaceId);
    registry.setDeviceActiveWorkspace(deviceId, remaining[0] ?? null);
  }

  registry.removeDeviceFromWorkspace(deviceId, workspaceId);
}

export class DeviceNotFoundError extends Error {
  constructor(deviceId: string) {
    super(`Dispositivo "${deviceId}" não registrado.`);
    this.name = 'DeviceNotFoundError';
  }
}

export class DeviceNotAuthenticatedError extends Error {
  constructor() {
    super('Dispositivo sem acesso a nenhum workspace.');
    this.name = 'DeviceNotAuthenticatedError';
  }
}

export class DeviceAccessDeniedError extends Error {
  constructor(workspaceId: string) {
    super(`Dispositivo sem acesso ao workspace "${workspaceId}".`);
    this.name = 'DeviceAccessDeniedError';
  }
}

export class InvalidJoinTokenError extends Error {
  constructor() {
    super('Token de acesso inválido ou revogado.');
    this.name = 'InvalidJoinTokenError';
  }
}
