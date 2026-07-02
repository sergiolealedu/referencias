import { Router } from 'express';

import type { AuthenticatedRequest } from '../middleware/deviceAuth.js';

export function createStatsRouter(): Router {
  const router = Router();

  router.get('/articles-by-year', (req, res) => {
    try {
      const versao = typeof req.query.versao === 'string' && req.query.versao.trim()
        ? req.query.versao.trim()
        : undefined;
      const stats = (req as AuthenticatedRequest).store.getArticleStatsByYear(versao);
      res.json(stats);
    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  router.post('/detect-duplicates', (req, res) => {
    try {
      const versao = typeof req.query.versao === 'string' && req.query.versao.trim()
        ? req.query.versao.trim()
        : 'v2';
      const result = (req as AuthenticatedRequest).store.markCrossGroupDuplicates(versao);
      res.json(result);
    } catch (error) {
      console.error('Erro ao detectar duplicatas:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  return router;
}
