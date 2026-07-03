import { Router } from 'express';
import { z } from 'zod';

import { defaultPdfRootsForDbPath, getAppSettings, saveAppSettings } from '../appSettings.js';
import type { AuthenticatedRequest } from '../middleware/deviceAuth.js';
import { assertServerAdmin, ServerAdminRequiredError } from '../serverAdmin.js';
import { invalidateStore } from '../storeManager.js';
import { syncAllWorkspacePdfRoots } from '../workspaceManager.js';

const updateSettingsSchema = z.object({
  sqliteDbPath: z.string().min(1),
  allowedPdfRoots: z.array(z.string().min(1)).min(1).optional(),
});

export function createSettingsRouter(): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const settings = getAppSettings();
    res.json({
      ...settings,
      activeWorkspaceId: authReq.activeWorkspace.id,
      activeWorkspaceName: authReq.activeWorkspace.name,
    });
  });

  router.put('/', async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      assertServerAdmin(authReq.deviceId);
      const body = updateSettingsSchema.parse(req.body ?? {});
      const allowedPdfRoots =
        body.allowedPdfRoots ?? defaultPdfRootsForDbPath(body.sqliteDbPath);
      const settings = await saveAppSettings({
        sqliteDbPath: body.sqliteDbPath,
        allowedPdfRoots,
      });
      await syncAllWorkspacePdfRoots(allowedPdfRoots);
      invalidateStore(authReq.activeWorkspace.sqliteDbPath);
      res.json({
        ...settings,
        activeWorkspaceId: authReq.activeWorkspace.id,
        activeWorkspaceName: authReq.activeWorkspace.name,
      });
    } catch (error) {
      if (error instanceof ServerAdminRequiredError) {
        res.status(403).json({ error: error.message });
        return;
      }
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
