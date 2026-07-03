import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';

import { createGroupSchema, updateGroupSchema } from '../schemas/referencias.js';
import { bibtexImportSchema } from '../schemas/import.js';
import { groupImportBodySchema } from '../schemas/groupTransfer.js';
import { StoreError } from '../store/storeError.js';
import type { AuthenticatedRequest } from '../middleware/deviceAuth.js';
import { PdfStorageError, removeManagedPdf, saveArticlePdf } from '../pdfStorage.js';
import { parseBibtex } from '../utils/bibtexParser.js';
import { exportArticlesSchema, parseArticleListParams } from '../schemas/articleList.js';

function handleRouteError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
    return;
  }
  if (error instanceof PdfStorageError) {
    const status = error.code === 'NOT_FOUND' ? 404 : 422;
    res.status(status).json({ error: error.message, code: error.code });
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

export function createGroupsRouter(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const groups = await storeFrom(req).listGroups();
      res.json(groups);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.post('/', async (req, res) => {
    try {
      const body = createGroupSchema.parse(req.body ?? {});
      const group = await storeFrom(req).createGroup(body);
      res.status(201).json(group);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.post('/import', async (req, res) => {
    try {
      const body = groupImportBodySchema.parse(req.body ?? {});
      const { options, ...exportPayload } = body;
      const result = await storeFrom(req).importGroup(exportPayload, options);
      res.status(201).json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.get('/usado-articles', async (req, res) => {
    try {
      const items = await storeFrom(req).listUsadoArticles();
      res.json(items);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.get('/:id/tags', async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      if (Number.isNaN(groupId)) {
        res.status(400).json({ error: 'ID de grupo inválido' });
        return;
      }
      const tags = await storeFrom(req).listGroupTags(groupId);
      res.json(tags);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.get('/:id/export', async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      if (Number.isNaN(groupId)) {
        res.status(400).json({ error: 'ID de grupo inválido' });
        return;
      }
      const payload = await storeFrom(req).exportGroup(groupId);
      res.json(payload);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      if (Number.isNaN(groupId)) {
        res.status(400).json({ error: 'ID de grupo inválido' });
        return;
      }
      const group = await storeFrom(req).getGroup(groupId);
      res.json(group);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      if (Number.isNaN(groupId)) {
        res.status(400).json({ error: 'ID de grupo inválido' });
        return;
      }
      const body = updateGroupSchema.parse(req.body ?? {});
      const group = await storeFrom(req).updateGroup(groupId, body);
      res.json(group);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      if (Number.isNaN(groupId)) {
        res.status(400).json({ error: 'ID de grupo inválido' });
        return;
      }
      await storeFrom(req).deleteGroup(groupId);
      res.status(204).send();
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.post('/:id/import/bibtex', async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      if (Number.isNaN(groupId)) {
        res.status(400).json({ error: 'ID de grupo inválido' });
        return;
      }
      const body = bibtexImportSchema.parse(req.body ?? {});
      const { entries, errors: parseErrors } = parseBibtex(body.bibtex);
      if (entries.length === 0) {
        res.status(400).json({
          error: 'Nenhuma entrada BibTeX válida encontrada',
          parseErrors,
        });
        return;
      }
      const options: import('../types/referencias.js').BibtexImportOptions = {
        source: body.source,
        originArticle: body.originArticle,
      };
      const result = await storeFrom(req).importBibtex(groupId, entries, options);
      if (parseErrors.length > 0) {
        result.parseErrors = parseErrors;
        result.parsed += parseErrors.length;
      }
      res.status(201).json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  return router;
}

export function parseArticleFilters(query: Request['query']) {
  return parseArticleListParams(query);
}

function parseGroupId(params: Record<string, string | undefined>): number | null {
  const raw = params.groupId ?? params.id;
  if (!raw) return null;
  const groupId = Number(raw);
  return Number.isNaN(groupId) ? null : groupId;
}

function parseKey(params: Record<string, string | undefined>): string | null {
  const raw = params.key;
  if (!raw || Array.isArray(raw)) return null;
  return raw;
}

export function createArticlesRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    try {
      const groupId = parseGroupId(req.params as Record<string, string | undefined>);
      if (groupId === null) {
        res.status(400).json({ error: 'ID de grupo inválido' });
        return;
      }
      const params = parseArticleListParams(req.query);
      const result = await storeFrom(req).listArticles(groupId, params);
      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.post('/', async (req, res) => {
    try {
      const groupId = parseGroupId(req.params as Record<string, string | undefined>);
      if (groupId === null) {
        res.status(400).json({ error: 'ID de grupo inválido' });
        return;
      }
      const { createArticleSchema } = await import('../schemas/referencias.js');
      const body = createArticleSchema.parse(req.body ?? {});
      const article = await storeFrom(req).createArticle(groupId, body);
      res.status(201).json(article);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.delete('/', async (req, res) => {
    try {
      const groupId = parseGroupId(req.params as Record<string, string | undefined>);
      if (groupId === null) {
        res.status(400).json({ error: 'ID de grupo inválido' });
        return;
      }
      const result = await storeFrom(req).clearGroupArticles(groupId);
      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.post('/export', async (req, res) => {
    try {
      const groupId = parseGroupId(req.params as Record<string, string | undefined>);
      if (groupId === null) {
        res.status(400).json({ error: 'ID de grupo inválido' });
        return;
      }
      const body = exportArticlesSchema.parse(req.body ?? {});
      const articles = await storeFrom(req).exportArticlesByKeys(groupId, body.keys);
      res.json(articles);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.get('/:key', async (req, res) => {
    try {
      const groupId = parseGroupId(req.params as Record<string, string | undefined>);
      const key = parseKey(req.params as Record<string, string | undefined>);
      if (groupId === null || !key) {
        res.status(400).json({ error: 'ID de grupo ou chave inválidos' });
        return;
      }
      const article = await storeFrom(req).getArticle(groupId, key);
      res.json(article);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  const updateHandler = async (req: Request, res: Response) => {
    try {
      const groupId = parseGroupId(req.params as Record<string, string | undefined>);
      const key = parseKey(req.params as Record<string, string | undefined>);
      if (groupId === null || !key) {
        res.status(400).json({ error: 'ID de grupo ou chave inválidos' });
        return;
      }
      const { articlePatchSchema } = await import('../schemas/referencias.js');
      const body = articlePatchSchema.parse(req.body ?? {});
      const article = await storeFrom(req).updateArticle(
        groupId,
        key,
        body as Partial<import('../types/referencias.js').Article> & {
          entry?: Partial<import('../types/referencias.js').Entry>;
        },
      );
      res.json(article);
    } catch (error) {
      handleRouteError(error, res);
    }
  };

  router.put('/:key', updateHandler);
  router.patch('/:key', updateHandler);

  router.post(
    '/:key/pdf',
    express.raw({
      type: ['application/pdf', 'application/octet-stream'],
      limit: '50mb',
    }),
    async (req, res) => {
      try {
        const groupId = parseGroupId(req.params as Record<string, string | undefined>);
        const key = parseKey(req.params as Record<string, string | undefined>);
        if (groupId === null || !key) {
          res.status(400).json({ error: 'ID de grupo ou chave inválidos' });
          return;
        }

        const authReq = req as unknown as AuthenticatedRequest;
        const store = storeFrom(req);
        const existing = await store.getArticle(groupId, key);
        const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

        const filePath = await saveArticlePdf(
          authReq.activeWorkspace.id,
          groupId,
          key,
          buffer,
        );

        // Novo arquivo sempre tem nome único; remove o PDF anterior deste artigo, se houver.
        await removeManagedPdf(authReq.activeWorkspace.id, existing.caminho);

        const article = await store.updateArticle(groupId, key, {
          caminho: filePath,
          status: existing.status === 'duplicate' ? existing.status : 'exists',
        });
        res.json(article);
      } catch (error) {
        handleRouteError(error, res);
      }
    },
  );

  router.delete('/:key/pdf', async (req, res) => {
    try {
      const groupId = parseGroupId(req.params as Record<string, string | undefined>);
      const key = parseKey(req.params as Record<string, string | undefined>);
      if (groupId === null || !key) {
        res.status(400).json({ error: 'ID de grupo ou chave inválidos' });
        return;
      }

      const authReq = req as unknown as AuthenticatedRequest;
      const store = storeFrom(req);
      const existing = await store.getArticle(groupId, key);
      await removeManagedPdf(authReq.activeWorkspace.id, existing.caminho);
      const article = await store.updateArticle(groupId, key, { caminho: '' });
      res.json(article);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  router.delete('/:key', async (req, res) => {
    try {
      const groupId = parseGroupId(req.params as Record<string, string | undefined>);
      const key = parseKey(req.params as Record<string, string | undefined>);
      if (groupId === null || !key) {
        res.status(400).json({ error: 'ID de grupo ou chave inválidos' });
        return;
      }
      const authReq = req as unknown as AuthenticatedRequest;
      const store = storeFrom(req);
      try {
        const existing = await store.getArticle(groupId, key);
        await removeManagedPdf(authReq.activeWorkspace.id, existing.caminho);
      } catch {
        // Artigo inexistente — deleteArticle abaixo responde 404.
      }
      await store.deleteArticle(groupId, key);
      res.status(204).send();
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  return router;
}

export function createSearchRouter(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const params = parseArticleListParams(req.query);
      const results = await storeFrom(req).searchArticles(params);
      res.json(results);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  return router;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  handleRouteError(error, res);
}
