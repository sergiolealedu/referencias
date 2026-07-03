import { Router } from 'express';
import { z } from 'zod';

import {
  addDeviceToNewWorkspace,
  createJoinToken,
  DeviceAccessDeniedError,
  getDeviceActiveWorkspace,
  InvalidJoinTokenError,
  joinWorkspaceWithToken,
  leaveWorkspace,
  listWorkspaceJoinTokens,
  revokeJoinToken,
  setDeviceActiveWorkspace,
} from '../deviceManager.js';
import { getAccessSetup } from '../bootstrapAccess.js';
import {
  DeviceHeaderMissingError,
  resolveDeviceForWorkspaces,
  type AuthenticatedRequest,
} from '../middleware/deviceAuth.js';
import { invalidateStore } from '../storeManager.js';
import {
  createWorkspace,
  listWorkspaceSummariesForDevice,
  syncActiveWorkspaceToAppSettings,
  updateWorkspace,
  updateWorkspacePaths,
  WorkspaceNotFoundError,
} from '../workspaceManager.js';

const workspaceInputSchema = z.object({
  name: z.string().min(1).max(120),
  sqliteDbPath: z.string().min(1).optional(),
  allowedPdfRoots: z.array(z.string().min(1)).min(1).optional(),
});

const workspaceUpdateSchema = workspaceInputSchema.partial();

const joinSchema = z.object({
  token: z.string().min(1),
});

function handleDeviceError(error: unknown, res: import('express').Response): boolean {
  if (error instanceof DeviceHeaderMissingError) {
    res.status(401).json({ error: error.message });
    return true;
  }
  if (error instanceof WorkspaceNotFoundError) {
    res.status(404).json({ error: error.message });
    return true;
  }
  if (error instanceof DeviceAccessDeniedError) {
    res.status(403).json({ error: error.message });
    return true;
  }
  if (error instanceof InvalidJoinTokenError) {
    res.status(400).json({ error: error.message });
    return true;
  }
  return false;
}

export function createWorkspacesRouter(): Router {
  const router = Router();

  router.get('/setup', (req, res) => {
    try {
      const { session } = resolveDeviceForWorkspaces(req);
      res.json(getAccessSetup(session));
    } catch (error) {
      if (!handleDeviceError(error, res)) {
        console.error('Erro ao obter status de acesso:', error);
        res.status(500).json({ error: 'Não foi possível obter status de acesso' });
      }
    }
  });

  router.get('/', (req, res) => {
    try {
      const { deviceId, session } = resolveDeviceForWorkspaces(req);
      const activeId = session.device.activeWorkspaceId;
      const workspaces = listWorkspaceSummariesForDevice(
        deviceId,
        activeId,
        session.workspaceIds,
      );
      res.json(workspaces);
    } catch (error) {
      if (!handleDeviceError(error, res)) {
        console.error('Erro ao listar workspaces:', error);
        res.status(500).json({ error: 'Não foi possível listar workspaces' });
      }
    }
  });

  router.get('/active', (req, res) => {
    try {
      const { deviceId } = resolveDeviceForWorkspaces(req);
      const active = getDeviceActiveWorkspace(deviceId);
      res.json({ ...active, isActive: true });
    } catch (error) {
      if (!handleDeviceError(error, res)) {
        console.error('Erro ao obter workspace ativo:', error);
        res.status(500).json({ error: 'Não foi possível obter workspace ativo' });
      }
    }
  });

  router.post('/join', (req, res) => {
    try {
      const { deviceId } = resolveDeviceForWorkspaces(req);
      const body = joinSchema.parse(req.body ?? {});
      const workspace = joinWorkspaceWithToken(deviceId, body.token.trim());
      setDeviceActiveWorkspace(deviceId, workspace.id);
      res.json({ ...workspace, isActive: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
        return;
      }
      if (!handleDeviceError(error, res)) {
        console.error('Erro ao entrar no workspace:', error);
        res.status(500).json({ error: 'Não foi possível entrar no workspace' });
      }
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { deviceId, session } = resolveDeviceForWorkspaces(req);
      const access = getAccessSetup(session);
      if (!access.canCreateWorkspace) {
        res.status(403).json({
          error:
            'Este servidor já possui workspaces configurados. Entre com um token de acesso concedido por quem já tem acesso.',
          inviteOnly: access.inviteOnly,
        });
        return;
      }
      const body = workspaceInputSchema.parse(req.body ?? {});
      const workspace = await createWorkspace(body);
      addDeviceToNewWorkspace(deviceId, workspace.id);
      await syncActiveWorkspaceToAppSettings(workspace);
      res.status(201).json({ ...workspace, isActive: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
        return;
      }
      if (!handleDeviceError(error, res)) {
        console.error('Erro ao criar workspace:', error);
        res.status(500).json({ error: 'Não foi possível criar o workspace' });
      }
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const { deviceId, session } = resolveDeviceForWorkspaces(req);
      const workspaceId = req.params.id;
      if (!session.workspaceIds.includes(workspaceId)) {
        res.status(403).json({ error: 'Sem acesso a este workspace.' });
        return;
      }
      const body = workspaceUpdateSchema.parse(req.body ?? {});
      const workspace = await updateWorkspace(workspaceId, body);
      invalidateStore(workspace.sqliteDbPath);
      res.json({
        ...workspace,
        isActive: session.device.activeWorkspaceId === workspace.id,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
        return;
      }
      if (!handleDeviceError(error, res)) {
        console.error('Erro ao atualizar workspace:', error);
        res.status(500).json({ error: 'Não foi possível atualizar o workspace' });
      }
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const { deviceId } = resolveDeviceForWorkspaces(req);
      const workspaceId = req.params.id;
      leaveWorkspace(deviceId, workspaceId);
      res.status(204).send();
    } catch (error) {
      if (!handleDeviceError(error, res)) {
        if (error instanceof Error) {
          res.status(400).json({ error: error.message });
          return;
        }
        console.error('Erro ao sair do workspace:', error);
        res.status(500).json({ error: 'Não foi possível sair do workspace' });
      }
    }
  });

  router.post('/:id/activate', async (req, res) => {
    try {
      const { deviceId } = resolveDeviceForWorkspaces(req);
      const workspaceId = req.params.id;
      setDeviceActiveWorkspace(deviceId, workspaceId);
      const workspace = getDeviceActiveWorkspace(deviceId);
      await syncActiveWorkspaceToAppSettings(workspace);
      res.json({ ...workspace, isActive: true });
    } catch (error) {
      if (!handleDeviceError(error, res)) {
        console.error('Erro ao ativar workspace:', error);
        res.status(500).json({ error: 'Não foi possível ativar o workspace' });
      }
    }
  });

  router.post('/:id/tokens', (req, res) => {
    try {
      const { deviceId } = resolveDeviceForWorkspaces(req);
      const token = createJoinToken(deviceId, req.params.id);
      res.status(201).json(token);
    } catch (error) {
      if (!handleDeviceError(error, res)) {
        console.error('Erro ao gerar token:', error);
        res.status(500).json({ error: 'Não foi possível gerar o token' });
      }
    }
  });

  router.get('/:id/tokens', (req, res) => {
    try {
      const { deviceId } = resolveDeviceForWorkspaces(req);
      const tokens = listWorkspaceJoinTokens(deviceId, req.params.id);
      res.json(tokens);
    } catch (error) {
      if (!handleDeviceError(error, res)) {
        console.error('Erro ao listar tokens:', error);
        res.status(500).json({ error: 'Não foi possível listar tokens' });
      }
    }
  });

  router.delete('/:id/tokens/:token', (req, res) => {
    try {
      const { deviceId } = resolveDeviceForWorkspaces(req);
      revokeJoinToken(deviceId, req.params.id, req.params.token);
      res.status(204).send();
    } catch (error) {
      if (!handleDeviceError(error, res)) {
        console.error('Erro ao revogar token:', error);
        res.status(500).json({ error: 'Não foi possível revogar o token' });
      }
    }
  });

  return router;
}

export async function updateActiveWorkspaceSettings(
  req: AuthenticatedRequest,
  sqliteDbPath: string,
  allowedPdfRoots: string[],
) {
  const workspace = await updateWorkspacePaths(
    req.activeWorkspace.id,
    sqliteDbPath,
    allowedPdfRoots,
  );
  invalidateStore(workspace.sqliteDbPath);
  await syncActiveWorkspaceToAppSettings(workspace);
  return workspace;
}
