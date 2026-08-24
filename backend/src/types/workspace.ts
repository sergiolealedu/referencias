export * from '@sergiolealedu/referencias-shared';

import type { Workspace } from '@sergiolealedu/referencias-shared';

/** Formato do `data/workspaces.json` — só o servidor lê e escreve este arquivo. */
export interface WorkspacesConfig {
  activeWorkspaceId: string;
  workspaces: Workspace[];
}
