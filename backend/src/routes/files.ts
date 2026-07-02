import { access, constants } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { basename, normalize, resolve } from 'node:path';
import { Router } from 'express';

import type { AuthenticatedRequest } from '../middleware/deviceAuth.js';

function isPathInsideAllowedRoots(filePath: string, allowedRoots: string[]): boolean {
  const normalized = resolve(normalize(filePath));
  return allowedRoots.some((root) => {
    const allowedRoot = resolve(normalize(root));
    return (
      normalized === allowedRoot ||
      normalized.startsWith(`${allowedRoot}\\`) ||
      normalized.startsWith(`${allowedRoot}/`)
    );
  });
}

export function createFilesRouter(): Router {
  const router = Router();

  router.get('/pdf', async (req, res) => {
    const rawPath = req.query.path;
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      res.status(400).json({ error: 'Caminho não informado' });
      return;
    }

    const filePath = resolve(normalize(rawPath.trim()));
    const allowedRoots = (req as AuthenticatedRequest).activeWorkspace.allowedPdfRoots;

    if (!isPathInsideAllowedRoots(filePath, allowedRoots)) {
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
  });

  return router;
}
