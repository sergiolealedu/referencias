export interface Workspace {
  id: string;
  name: string;
  sqliteDbPath: string;
  allowedPdfRoots: string[];
  createdAt: string;
}

export interface WorkspacesConfig {
  activeWorkspaceId: string;
  workspaces: Workspace[];
}

export interface WorkspaceInput {
  name: string;
  sqliteDbPath?: string;
  allowedPdfRoots?: string[];
}

export interface WorkspaceSummary extends Workspace {
  isActive: boolean;
}
