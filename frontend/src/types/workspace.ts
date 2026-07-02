export interface Workspace {
  id: string;
  name: string;
  sqliteDbPath: string;
  allowedPdfRoots: string[];
  createdAt: string;
}

export interface WorkspaceSummary extends Workspace {
  isActive: boolean;
}

export interface WorkspaceInput {
  name: string;
  sqliteDbPath?: string;
  allowedPdfRoots?: string[];
}
