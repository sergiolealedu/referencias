import { getServerAdminDeviceId, isServerAdmin } from './serverAdmin.js';
import type { WorkspaceInput } from './types/workspace.js';

/**
 * `sqliteDbPath` e `allowedPdfRoots` são caminhos absolutos no disco do
 * servidor: quem os define escolhe o que a API lê. Um membro qualquer que
 * pudesse gravá-los apontaria `allowedPdfRoots` para a raiz do disco e leria
 * qualquer PDF da máquina, ou apontaria `sqliteDbPath` para o banco de outro
 * workspace e leria os dados de lá.
 *
 * A configuração global já é restrita ao administrador (ver `routes/settings`);
 * isto estende a mesma regra à configuração por workspace. Quem não é
 * administrador ainda cria e renomeia workspaces — só não escolhe caminhos.
 */
export class WorkspacePathsForbiddenError extends Error {
  constructor() {
    super(
      'Somente o administrador da instalação pode definir caminhos de banco e de PDF.',
    );
    this.name = 'WorkspacePathsForbiddenError';
  }
}

/**
 * Antes do primeiro acesso não existe administrador, e quem cria o workspace
 * inicial se torna um (`assignServerAdminIfUnset`). Tratar esse caso como
 * autorizado é o que mantém a instalação inicial funcionando.
 */
export function mayConfigureWorkspacePaths(deviceId: string): boolean {
  // Vazio conta como ausente, igual ao que `assignServerAdminIfUnset` entende
  // por "ainda não há administrador" — as duas leituras precisam bater, senão
  // um registry com a chave vazia trancaria a configuração para todos.
  return !getServerAdminDeviceId() || isServerAdmin(deviceId);
}

/**
 * Devolve a entrada sem os campos de caminho quando o dispositivo não pode
 * defini-los. Recusa em vez de ignorar em silêncio: pedir um caminho e receber
 * outro é pior que receber 403.
 */
export function assertWorkspacePathsAllowed(
  deviceId: string,
  input: Partial<WorkspaceInput>,
): void {
  const pediuCaminho =
    input.sqliteDbPath !== undefined || input.allowedPdfRoots !== undefined;
  if (pediuCaminho && !mayConfigureWorkspacePaths(deviceId)) {
    throw new WorkspacePathsForbiddenError();
  }
}
