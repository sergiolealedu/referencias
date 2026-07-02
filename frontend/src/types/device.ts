export interface Device {
  id: string;
  label: string | null;
  createdAt: string;
  activeWorkspaceId: string | null;
}

export interface DeviceSession {
  device: Device;
  workspaceIds: string[];
  needsOnboarding: boolean;
  authToken: string;
}

export interface JoinTokenInfo {
  token: string;
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
}
