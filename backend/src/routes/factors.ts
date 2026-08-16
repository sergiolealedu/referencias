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

const importFactorsSchema = z.object({
  factors: z
    .array(
      z.object({
        id: z.string().trim().min(1).optional(),
        name: z.string().trim().min(1),
        aliases: z.array(z.string()).optional(),
      }),
    )
    .min(1, 'Arquivo sem fatores')
    .max(5000),
});

const deltaSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string().trim().min(1),
        /** Opcional: sem ele o artigo é procurado em todos os grupos. */
        groupId: z.number().int().optional(),
        factors: z
          .array(
            z.object({
              factorId: z.string().trim().min(1).optional(),
              label: z.string().trim().min(1),
              polarity: z.enum(['positive', 'negative']).optional(),
              description: z.string().optional(),
              aliases: z.array(z.string()).optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1, 'Arquivo sem itens')
    .max(5000),
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

  /**
   * Importa um catálogo exportado. Reusa ensureFactor, que casa o fator por id
   * ou por qualquer grafia já conhecida e mescla as grafias novas — então
   * reimportar o mesmo arquivo não duplica nada.
   */
  router.post('/import', async (req, res) => {
    try {
      const body = importFactorsSchema.parse(req.body ?? {});
      const store = storeFrom(req);
      const antes = await store.listFactors();
      const idsAntes = new Set(antes.map((f) => f.id));

      let criados = 0;
      let atualizados = 0;
      const erros: { name: string; motivo: string }[] = [];

      for (const entrada of body.factors) {
        try {
          const factor = await store.ensureFactor({
            id: entrada.id,
            name: entrada.name,
            aliases: entrada.aliases ?? [],
          });
          if (idsAntes.has(factor.id)) atualizados += 1;
          else {
            criados += 1;
            idsAntes.add(factor.id);
          }
        } catch (error) {
          erros.push({ name: entrada.name, motivo: (error as Error).message });
        }
      }

      res.json({ recebidos: body.factors.length, criados, atualizados, erros });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  /**
   * Delta: liga fatores a artigos que JÁ existem. Nada é criado nem removido —
   * cada item soma/atualiza os fatores daquele artigo.
   */
  router.post('/apply-delta', async (req, res) => {
    try {
      const body = deltaSchema.parse(req.body ?? {});
      const store = storeFrom(req);

      let aplicados = 0;
      let fatoresAplicados = 0;
      const naoEncontrados: string[] = [];
      const ambiguos: { key: string; grupos: number[] }[] = [];
      const erros: { key: string; motivo: string }[] = [];

      for (const item of body.items) {
        try {
          let grupos: number[];
          if (item.groupId !== undefined) {
            grupos = [item.groupId];
          } else {
            grupos = await store.findArticleGroupsByKey(item.key);
            if (grupos.length === 0) {
              naoEncontrados.push(item.key);
              continue;
            }
            // Mesma chave em vários grupos: aplicar em todos seria adivinhar.
            if (grupos.length > 1) {
              ambiguos.push({ key: item.key, grupos });
              continue;
            }
          }

          await store.addFactorsToArticle(
            grupos[0],
            item.key,
            item.factors.map((f) => ({
              factorId: f.factorId,
              label: f.label,
              polarity: f.polarity ?? 'positive',
              description: f.description ?? '',
              aliases: f.aliases ?? [],
            })),
          );
          aplicados += 1;
          fatoresAplicados += item.factors.length;
        } catch (error) {
          if (error instanceof StoreError && error.code === 'NOT_FOUND') {
            naoEncontrados.push(item.key);
            continue;
          }
          erros.push({ key: item.key, motivo: (error as Error).message });
        }
      }

      res.json({
        recebidos: body.items.length,
        aplicados,
        fatoresAplicados,
        naoEncontrados,
        ambiguos,
        erros,
      });
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
