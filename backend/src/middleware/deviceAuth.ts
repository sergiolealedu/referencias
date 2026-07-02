import type { NextFunction, Request, Response } from 'express';

import {
  DeviceNotAuthenticatedError,
  DeviceNotFoundError,
  getDeviceActiveWorkspace,
  getDeviceSession,
  getDeviceSessionByAuthToken,
  registerDevice,
} from '../deviceManager.js';
import { getStore } from '../storeManager.js';
import type { SqliteStore } from '../store/sqliteStore.js';
import type { Device, DeviceSession } from '../types/device.js';
import type { Workspace } from '../types/workspace.js';

export interface AuthenticatedRequest extends Request {
  deviceId: string;
  deviceSession: DeviceSession;
  activeWorkspace: Workspace;
  store: SqliteStore;
}

const AUTH_TOKEN_HEADER = 'x-auth-token';
const DEVICE_HEADER = 'x-device-id';

export function getAuthTokenFromRequest(req: Request): string | null {
  const header = req.headers[AUTH_TOKEN_HEADER];
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  return null;
}

export function getDeviceIdFromRequest(req: Request): string | null {
  const header = req.headers[DEVICE_HEADER];
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  return null;
}

function resolveSession(req: Request): DeviceSession | null {
  const authToken = getAuthTokenFromRequest(req);
  if (authToken) {
    const session = getDeviceSessionByAuthToken(authToken);
    if (session) return session;
  }

  const deviceId = getDeviceIdFromRequest(req);
  if (deviceId) {
    return getDeviceSession(deviceId) ?? registerDevice(deviceId);
  }

  return null;
}

export function requireDevice(req: Request, res: Response, next: NextFunction): void {
  try {
    const session = resolveSession(req);
    if (!session) {
      res.status(401).json({
        error: 'Token de autenticação ausente (header X-Auth-Token).',
      });
      return;
    }

    if (session.needsOnboarding) {
      res.status(403).json({
        error: 'Dispositivo sem workspace. Crie um novo ou entre com um token.',
        needsOnboarding: true,
      });
      return;
    }

    const activeWorkspace = getDeviceActiveWorkspace(session.device.id);
    const authReq = req as AuthenticatedRequest;
    authReq.deviceId = session.device.id;
    authReq.deviceSession = session;
    authReq.activeWorkspace = activeWorkspace;
    authReq.store = getStore(activeWorkspace.sqliteDbPath);
    next();
  } catch (error) {
    if (error instanceof DeviceNotFoundError || error instanceof DeviceNotAuthenticatedError) {
      res.status(401).json({ error: (error as Error).message });
      return;
    }
    next(error);
  }
}

export function resolveDeviceForWorkspaces(req: Request): {
  deviceId: string;
  session: DeviceSession;
} {
  const session = resolveSession(req);
  if (!session) {
    throw new AuthTokenMissingError();
  }

  return { deviceId: session.device.id, session };
}

export class AuthTokenMissingError extends Error {
  constructor() {
    super('Token de autenticação ausente (header X-Auth-Token).');
    this.name = 'AuthTokenMissingError';
  }
}

/** @deprecated Use AuthTokenMissingError */
export class DeviceHeaderMissingError extends AuthTokenMissingError {}

export type { Device, DeviceSession };
