import { getRegistry } from './registry/registryStore.js';
import type { DeviceSession } from './types/device.js';
import type { AccessSetup } from './types/workspace.js';
import { isServerAdmin } from './serverAdmin.js';
import { getActiveWorkspace, getWorkspacesConfig } from './workspaceManager.js';

const BOOTSTRAP_DEVICE_ID = 'bootstrap-system';
const BOOTSTRAP_TOKEN_META_KEY = 'bootstrap_join_token';
const BOOTSTRAP_WORKSPACE_META_KEY = 'bootstrap_workspace_id';

export interface BootstrapJoinInfo {
  token: string;
  workspaceId: string;
  workspaceName: string;
}

export function countAllMemberships(): number {
  return getRegistry().countAllMemberships();
}

function resolveBootstrapWorkspace() {
  const registry = getRegistry();
  const storedId = registry.getMeta(BOOTSTRAP_WORKSPACE_META_KEY);
  const config = getWorkspacesConfig();
  const workspace =
    (storedId ? config.workspaces.find((ws) => ws.id === storedId) : null) ??
    config.workspaces.find((ws) => ws.id === config.activeWorkspaceId) ??
    config.workspaces[0];
  return workspace ?? getActiveWorkspace();
}

export function ensureBootstrapJoinToken(): BootstrapJoinInfo | null {
  if (countAllMemberships() > 0) {
    return null;
  }

  const registry = getRegistry();
  const workspace = resolveBootstrapWorkspace();
  const existingToken = registry.getMeta(BOOTSTRAP_TOKEN_META_KEY);

  if (existingToken) {
    const joinToken = registry.getJoinToken(existingToken);
    if (joinToken && joinToken.workspace_id === workspace.id) {
      return {
        token: existingToken,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      };
    }
  }

  if (!registry.getDevice(BOOTSTRAP_DEVICE_ID)) {
    registry.createDevice(BOOTSTRAP_DEVICE_ID, 'bootstrap-system');
  }

  const row = registry.createJoinToken(workspace.id, BOOTSTRAP_DEVICE_ID);
  registry.setMeta(BOOTSTRAP_TOKEN_META_KEY, row.token);
  registry.setMeta(BOOTSTRAP_WORKSPACE_META_KEY, workspace.id);

  return {
    token: row.token,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
  };
}

export function getAccessSetup(session: DeviceSession): AccessSetup {
  const hasAnyMember = countAllMemberships() > 0;
  const hasExistingWorkspaces = getWorkspacesConfig().workspaces.length > 0;
  const needsOnboarding = session.needsOnboarding;
  const bootstrap = needsOnboarding && !hasAnyMember ? ensureBootstrapJoinToken() : null;

  return {
    hasAnyMember,
    hasExistingWorkspaces,
    needsOnboarding,
    canCreateWorkspace: true,
    inviteOnly: needsOnboarding && hasExistingWorkspaces,
    bootstrapToken: bootstrap?.token,
    bootstrapWorkspaceId: bootstrap?.workspaceId,
    bootstrapWorkspaceName: bootstrap?.workspaceName,
    isServerAdmin: isServerAdmin(session.device.id),
  };
}

export function logBootstrapTokenIfNeeded(): void {
  const bootstrap = ensureBootstrapJoinToken();
  if (!bootstrap) {
    return;
  }

  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Primeiro acesso — token de convite');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Workspace: ${bootstrap.workspaceName}`);
  console.log(`  Token:     ${bootstrap.token}`);
  console.log('');
  console.log('  Abra a aplicação no navegador e use "Obter acesso inicial"');
  console.log('  ou cole o token em "Entrar com token".');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');
}
