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

  router.get('/status-activity', (req, res) => {
    try {
      const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
      const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
      if (!from || !to) {
        res.status(400).json({ error: 'Parâmetros from e to são obrigatórios (ISO 8601)' });
        return;
      }
      const versao = typeof req.query.versao === 'string' && req.query.versao.trim()
        ? req.query.versao.trim()
        : undefined;
      const stats = (req as AuthenticatedRequest).store.getStatusActivity({ from, to, versao });
      res.json(stats);
    } catch (error) {
      console.error('Erro ao obter atividade de status:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  return router;
}
