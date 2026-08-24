import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Regressão da falha em que registrar um dispositivo concedia acesso.
 *
 * O `X-Device-Id` é um header — o cliente escolhe o valor. Enquanto o registro
 * concedia os "workspaces legados" a todo ID sem membership, bastava mandar um
 * valor inventado para virar membro do workspace da tese e receber um token de
 * autenticação permanente, passando por baixo do portão de convite. Dezessete
 * dispositivos de teste (`dbg*`, `qa-*`) entraram exatamente assim.
 *
 * Aponta REGISTRY_DB_PATH para um temporário ANTES de importar, senão o
 * singleton abre o registry de verdade.
 */

const dir = mkdtempSync(join(tmpdir(), 'referencias-registry-'));
process.env.REGISTRY_DB_PATH = join(dir, 'registry.db');
process.env.WORKSPACES_CONFIG_PATH = join(dir, 'workspaces.json');

const { registerDevice, getDeviceSession, getDeviceSessionByAuthToken, joinWorkspaceWithToken } =
  await import('./deviceManager.js');
const { getRegistry } = await import('./registry/registryStore.js');
const { getServerAdminDeviceId } = await import('./serverAdmin.js');
const { loadWorkspaces } = await import('./workspaceManager.js');

const WORKSPACE = 'tese-do-sergio';

beforeAll(async () => {
  // `loadWorkspaces` sem arquivo cria o workspace inicial no temporário — é a
  // instalação com um workspace já existente, que é o cenário do buraco.
  await loadWorkspaces();

  // Simula a instalação já em uso: o dispositivo legítimo do dono como membro
  // e administrador.
  const registry = getRegistry();
  registry.createDevice('dono-legitimo', 'notebook do dono');
  registry.addDeviceToWorkspace('dono-legitimo', WORKSPACE);
  registry.setDeviceActiveWorkspace('dono-legitimo', WORKSPACE);
  registry.setMeta('server_admin_device_id', 'dono-legitimo');
  // A chave que a migração antiga consultava para conceder acesso.
  registry.setMeta('legacy_workspace_ids', JSON.stringify([WORKSPACE]));
});

afterAll(() => {
  // O SQLite precisa fechar antes do rmSync, senão o Windows dá EPERM.
  getRegistry().close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

describe('registerDevice não concede acesso', () => {
  it('dispositivo com ID inventado nasce sem workspace nenhum', () => {
    const sessão = registerDevice('id-inventado-por-estranho');
    expect(sessão.workspaceIds).toEqual([]);
    expect(sessão.needsOnboarding).toBe(true);
  });

  it('não concede acesso nem quando a chave de workspaces legados existe', () => {
    expect(getRegistry().getMeta('legacy_workspace_ids')).toContain(WORKSPACE);
    const sessão = registerDevice('outro-id-inventado');
    expect(sessão.workspaceIds).not.toContain(WORKSPACE);
    expect(sessão.workspaceIds).toEqual([]);
  });

  it('não promove o intruso a administrador da instalação', () => {
    registerDevice('candidato-a-admin');
    expect(getServerAdminDeviceId()).toBe('dono-legitimo');
    expect(registerDevice('candidato-a-admin').isServerAdmin).toBe(false);
  });

  it('vale também para o registro sem ID, que gera um UUID', () => {
    const sessão = registerDevice();
    expect(sessão.workspaceIds).toEqual([]);
    expect(sessão.needsOnboarding).toBe(true);
    expect(sessão.device.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('registrar duas vezes o mesmo ID não acumula acesso', () => {
    registerDevice('repetido');
    const segunda = registerDevice('repetido');
    expect(segunda.workspaceIds).toEqual([]);
  });
});

describe('quem já era membro continua entrando', () => {
  it('o dispositivo do dono mantém acesso e o papel de administrador', () => {
    const sessão = getDeviceSession('dono-legitimo');
    expect(sessão).not.toBeNull();
    expect(sessão!.workspaceIds).toEqual([WORKSPACE]);
    expect(sessão!.needsOnboarding).toBe(false);
    expect(sessão!.isServerAdmin).toBe(true);
  });

  it('o token de autenticação resolve a mesma sessão', () => {
    const porId = getDeviceSession('dono-legitimo')!;
    const porToken = getDeviceSessionByAuthToken(porId.authToken);
    expect(porToken?.device.id).toBe('dono-legitimo');
  });

  it('token inexistente não resolve sessão nenhuma', () => {
    expect(getDeviceSessionByAuthToken('dev_token_que_nao_existe')).toBeNull();
  });

  it('dispositivo desconhecido não tem sessão antes de registrar', () => {
    expect(getDeviceSession('nunca-visto')).toBeNull();
  });
});

describe('o convite continua sendo o caminho de entrada', () => {
  it('token válido dá acesso ao workspace do convite', () => {
    const convite = getRegistry().createJoinToken(WORKSPACE, 'dono-legitimo');

    const sessão = registerDevice('convidado');
    expect(sessão.workspaceIds).toEqual([]);

    const workspace = joinWorkspaceWithToken('convidado', convite.token);
    expect(workspace.id).toBe(WORKSPACE);
    expect(getDeviceSession('convidado')!.workspaceIds).toEqual([WORKSPACE]);
  });

  it('token inválido é recusado', () => {
    registerDevice('sem-convite-valido');
    expect(() => joinWorkspaceWithToken('sem-convite-valido', 'ws_naoexiste')).toThrow();
    expect(getDeviceSession('sem-convite-valido')!.workspaceIds).toEqual([]);
  });

  it('token revogado é recusado', () => {
    const registry = getRegistry();
    const convite = registry.createJoinToken(WORKSPACE, 'dono-legitimo');
    registry.revokeJoinToken(convite.token);

    registerDevice('convite-revogado');
    expect(() => joinWorkspaceWithToken('convite-revogado', convite.token)).toThrow();
    expect(getDeviceSession('convite-revogado')!.workspaceIds).toEqual([]);
  });
});
