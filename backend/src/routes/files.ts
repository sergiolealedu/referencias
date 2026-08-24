import { access, constants } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { basename, normalize, resolve } from 'node:path';
import { Router } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../middleware/deviceAuth.js';
import { allowedPdfRootsForWorkspace, isPathInsideRoots } from '../pdfStorage.js';
import {
  DEFAULT_SHARE_TTL_HOURS,
  ShareTokenError,
  createShareToken,
  verifyShareToken,
} from '../shareLinks.js';
import { getWorkspaceById } from '../workspaceManager.js';

/** Valida o caminho e envia o PDF; compartilhado entre a rota autenticada e a pública. */
async function streamPdf(
  filePath: string,
  allowedRoots: string[],
  res: Parameters<Parameters<Router['get']>[1]>[1],
): Promise<void> {
  if (!isPathInsideRoots(filePath, allowedRoots)) {
    res.status(403).json({ error: 'Caminho fora das pastas permitidas' });
    return;
  }

  if (!filePath.toLowerCase().endsWith('.pdf')) {
    res.status(400).json({ error: 'O arquivo deve ser um PDF' });
    return;
  }

  try {
    await access(filePath, constants.R_OK);
  } catch {
    res.status(404).json({
      error: 'Arquivo não encontrado. Verifique o caminho ou se o Google Drive está sincronizado.',
    });
    return;
  }

  const filename = basename(filePath);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

  const stream = createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Não foi possível ler o arquivo PDF' });
    }
  });
  stream.pipe(res);
}

/**
 * Rota pública: o próprio link carrega um token assinado com validade, então
 * não exige o header de autenticação. Precisa ser montada ANTES do
 * `requireDevice`.
 */
export function createPublicShareRouter(): Router {
  const router = Router();

  router.get('/pdf', async (req, res) => {
    const token = typeof req.query.t === 'string' ? req.query.t : '';
    if (!token) {
      res.status(400).json({ error: 'Link sem token.' });
      return;
    }

    try {
      const { w: workspaceId, p: filePath } = verifyShareToken(token);
      const workspace = getWorkspaceById(workspaceId);
      const allowedRoots = allowedPdfRootsForWorkspace(
        workspace.id,
        workspace.allowedPdfRoots,
      );
      await streamPdf(resolve(normalize(filePath)), allowedRoots, res);
    } catch (error) {
      if (error instanceof ShareTokenError) {
        res.status(error.code === 'EXPIRED' ? 410 : 403).json({ error: error.message });
        return;
      }
      res.status(404).json({ error: 'Workspace do link não encontrado.' });
    }
  });

  return router;
}

export function createFilesRouter(): Router {
  const router = Router();

  /** Gera um link temporário que abre o PDF sem expor o token de acesso. */
  router.post('/share-link', async (req, res) => {
    const body = z
      .object({
        path: z.string().trim().min(1),
        ttlHours: z.number().int().positive().optional(),
      })
      .safeParse(req.body ?? {});

    if (!body.success) {
      res.status(400).json({ error: 'Caminho não informado' });
      return;
    }

    const filePath = resolve(normalize(body.data.path.trim()));
    const authReq = req as AuthenticatedRequest;
    const allowedRoots = allowedPdfRootsForWorkspace(
      authReq.activeWorkspace.id,
      authReq.activeWorkspace.allowedPdfRoots,
    );

    if (!isPathInsideRoots(filePath, allowedRoots)) {
      res.status(403).json({ error: 'Caminho fora das pastas permitidas' });
      return;
    }
    if (!filePath.toLowerCase().endsWith('.pdf')) {
      res.status(400).json({ error: 'O arquivo deve ser um PDF' });
      return;
    }
    try {
      await access(filePath, constants.R_OK);
    } catch {
      res.status(404).json({ error: 'Arquivo não encontrado.' });
      return;
    }

    const { token, expiresAt } = createShareToken(
      authReq.activeWorkspace.id,
      filePath,
      body.data.ttlHours ?? DEFAULT_SHARE_TTL_HOURS,
    );
    res.json({ path: `/api/share/pdf?t=${encodeURIComponent(token)}`, expiresAt });
  });

  router.get('/pdf', async (req, res) => {
    const rawPath = req.query.path;
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      res.status(400).json({ error: 'Caminho não informado' });
      return;
    }

    const authReq = req as AuthenticatedRequest;
    const allowedRoots = allowedPdfRootsForWorkspace(
      authReq.activeWorkspace.id,
      authReq.activeWorkspace.allowedPdfRoots,
    );
    await streamPdf(resolve(normalize(rawPath.trim())), allowedRoots, res);
  });

  return router;
}
