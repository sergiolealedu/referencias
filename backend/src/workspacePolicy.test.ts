import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Regressão da falha em que qualquer membro escolhia caminhos do servidor.
 *
 * `sqliteDbPath` e `allowedPdfRoots` decidem o que a API lê do disco. Enquanto
 * `PUT /api/workspaces/:id` só checava membership, um membro apontava
 * `allowedPdfRoots` para a raiz do disco e lia qualquer PDF da máquina, ou
 * apontava `sqliteDbPath` para o banco de outro workspace e lia os dados de lá.
 */

const dir = mkdtempSync(join(tmpdir(), 'referencias-policy-'));
process.env.REGISTRY_DB_PATH = join(dir, 'registry.db');
process.env.WORKSPACES_CONFIG_PATH = join(dir, 'workspaces.json');

const {
  assertWorkspacePathsAllowed,
  mayConfigureWorkspacePaths,
  WorkspacePathsForbiddenError,
} = await import('./workspacePolicy.js');
const { getRegistry } = await import('./registry/registryStore.js');
const { SERVER_ADMIN_META_KEY } = await import('./serverAdmin.js');

const ADMIN = 'dispositivo-admin';
const MEMBRO = 'dispositivo-membro';

/** Não há remoção de meta; vazio é o "sem administrador" que o código entende. */
function definirAdmin(deviceId: string | null): void {
  getRegistry().setMeta(SERVER_ADMIN_META_KEY, deviceId ?? '');
}

afterAll(() => {
  getRegistry().close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

beforeEach(() => {
  definirAdmin(ADMIN);
});

describe('mayConfigureWorkspacePaths', () => {
  it('autoriza o administrador da instalação', () => {
    expect(mayConfigureWorkspacePaths(ADMIN)).toBe(true);
  });

  it('recusa quem não é administrador', () => {
    expect(mayConfigureWorkspacePaths(MEMBRO)).toBe(false);
  });

  /**
   * Antes do primeiro acesso não existe administrador, e quem cria o workspace
   * inicial se torna um. Bloquear aqui travaria a instalação limpa.
   */
  it('autoriza qualquer dispositivo enquanto não houver administrador', () => {
    definirAdmin(null);
    expect(mayConfigureWorkspacePaths('primeiro-dispositivo')).toBe(true);
  });
});

describe('assertWorkspacePathsAllowed', () => {
  it('deixa passar entrada sem campo de caminho, venha de quem vier', () => {
    expect(() => assertWorkspacePathsAllowed(MEMBRO, { name: 'Meu workspace' })).not.toThrow();
    expect(() => assertWorkspacePathsAllowed(MEMBRO, {})).not.toThrow();
  });

  it('recusa allowedPdfRoots de quem não administra', () => {
    expect(() =>
      assertWorkspacePathsAllowed(MEMBRO, { name: 'x', allowedPdfRoots: ['C:\\'] }),
    ).toThrow(WorkspacePathsForbiddenError);
  });

  it('recusa sqliteDbPath de quem não administra', () => {
    expect(() =>
      assertWorkspacePathsAllowed(MEMBRO, {
        name: 'x',
        sqliteDbPath: 'C:\\dados\\de-outro-workspace.db',
      }),
    ).toThrow(WorkspacePathsForbiddenError);
  });

  /** Lista vazia ainda é uma tentativa de escrever o campo: não passa calado. */
  it('recusa até allowedPdfRoots vazio de quem não administra', () => {
    expect(() => assertWorkspacePathsAllowed(MEMBRO, { allowedPdfRoots: [] })).toThrow(
      WorkspacePathsForbiddenError,
    );
  });

  it('permite os dois campos para o administrador', () => {
    expect(() =>
      assertWorkspacePathsAllowed(ADMIN, {
        sqliteDbPath: 'G:\\Meu Drive\\doutorado\\referencias.db',
        allowedPdfRoots: ['G:\\Meu Drive\\doutorado'],
      }),
    ).not.toThrow();
  });

  it('a mensagem do erro diz de quem é a permissão', () => {
    try {
      assertWorkspacePathsAllowed(MEMBRO, { allowedPdfRoots: ['C:\\'] });
      expect.unreachable('deveria ter lançado');
    } catch (erro) {
      expect((erro as Error).message).toContain('administrador');
    }
  });
});
