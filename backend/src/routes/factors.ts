import { Router, type Request, type Response } from 'express';
import { ZodError, z } from 'zod';

import type { AuthenticatedRequest } from '../middleware/deviceAuth.js';
import { StoreError } from '../store/storeError.js';

const ensureFactorSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1, 'Nome do fator é obrigatório'),
  aliases: z.array(z.string()).optional(),
});

const updateFactorSchema = z.object({
  name: z.string().min(1).optional(),
  aliases: z.array(z.string()).optional(),
  /** Lista completa de grafias/traduções (inclui o nome canônico). */
  spellings: z.array(z.string()).optional(),
});

function handleRouteError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
    return;
  }
  if (error instanceof StoreError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'CONFLICT'
          ? 409
          : error.code === 'VALIDATION'
            ? 422
            : 500;
    res.status(status).json({ error: error.message, code: error.code });
    return;
  }
  console.error('Erro não tratado:', error);
  res.status(500).json({ error: 'Erro interno do servidor' });
}

function storeFrom(req: Request) {
  return (req as AuthenticatedRequest).store;
}

export function createFactorsRouter(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const factors = await storeFrom(req).listFactors();
      res.json(factors);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.get('/overview', async (req, res) => {
    try {
      const factors = await storeFrom(req).listFactorOverviews();
      res.json(factors);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.post('/', async (req, res) => {
    try {
      const body = ensureFactorSchema.parse(req.body ?? {});
      const factor = await storeFrom(req).ensureFactor(body);
      res.status(201).json(factor);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: 'ID do fator inválido' });
        return;
      }
      const body = updateFactorSchema.parse(req.body ?? {});
      const factor = await storeFrom(req).updateFactor(id, body);
      res.json(factor);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  return router;
}
