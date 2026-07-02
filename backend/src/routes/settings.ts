import { Router } from 'express';
import { z } from 'zod';

import { defaultPdfRootsForDbPath, getAppSettings } from '../appSettings.js';
import type { AuthenticatedRequest } from '../middleware/deviceAuth.js';
import { updateActiveWorkspaceSettings } from './workspaces.js';

const updateSettingsSchema = z.object({
  sqliteDbPath: z.string().min(1),
  allowedPdfRoots: z.array(z.string().min(1)).min(1).optional(),
});

export function createSettingsRouter(): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const authReq = req as AuthenticatedRequest;
    res.json({
      ...getAppSettings(),
      activeWorkspaceId: authReq.activeWorkspace.id,
      activeWorkspaceName: authReq.activeWorkspace.name,
      sqliteDbPath: authReq.activeWorkspace.sqliteDbPath,
      allowedPdfRoots: authReq.activeWorkspace.allowedPdfRoots,
    });
  });

  router.put('/', async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const body = updateSettingsSchema.parse(req.body ?? {});
      const allowedPdfRoots =
        body.allowedPdfRoots ?? defaultPdfRootsForDbPath(body.sqliteDbPath);
      const workspace = await updateActiveWorkspaceSettings(
        authReq,
        body.sqliteDbPath,
        allowedPdfRoots,
      );
      res.json({
        sqliteDbPath: workspace.sqliteDbPath,
        allowedPdfRoots: workspace.allowedPdfRoots,
        activeWorkspaceId: workspace.id,
        activeWorkspaceName: workspace.name,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
        return;
      }
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        res.status(404).json({
          error: 'Banco SQLite ou pasta não encontrados. Verifique o caminho informado.',
        });
        return;
      }
      console.error('Erro ao salvar configuração:', error);
      res.status(500).json({ error: 'Não foi possível salvar a configuração' });
    }
  });

  return router;
}
