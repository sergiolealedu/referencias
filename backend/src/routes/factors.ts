import { Router, type Request, type Response } from 'express';
import { ZodError, z } from 'zod';

import type { AuthenticatedRequest } from '../middleware/deviceAuth.js';
import type { Article } from '../types/referencias.js';
import { StoreError } from '../store/storeError.js';
import { createShareToken } from '../shareLinks.js';

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
   * Pacote autoexplicativo para análise por IA: catálogo (para ela reusar as
   * grafias já existentes em vez de inventar rótulos), artigos com link do PDF,
   * e o esquema exato do delta que o app aceita de volta.
   */
  router.get('/export-analise', async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const store = authReq.store;

      // Um artigo específico, ou o lote dos usados.
      const groupIdRaw = req.query.groupId;
      const keyRaw = req.query.key;
      const artigoUnico =
        typeof groupIdRaw === 'string' && typeof keyRaw === 'string' && keyRaw.trim();

      const catalogo = await store.listFactors();

      let selecionados: { groupId: number; groupTitle: string; article: Article }[];
      let escopo: string;

      if (artigoUnico) {
        const groupId = Number(groupIdRaw);
        if (Number.isNaN(groupId)) {
          res.status(400).json({ error: 'ID de grupo inválido' });
          return;
        }
        const [article, grupo] = await Promise.all([
          store.getArticle(groupId, keyRaw.trim()),
          store.getGroup(groupId),
        ]);
        selecionados = [{ groupId, groupTitle: grupo.title, article }];
        escopo = `artigo ${article.entry.key}`;
      } else {
        const somenteSemFatores = req.query.escopo !== 'usados';
        const usados = await store.listUsadoArticles();
        selecionados = somenteSemFatores
          ? usados.filter((item) => item.article.factors.length === 0)
          : usados;
        escopo = somenteSemFatores ? 'usados sem fatores' : 'todos os usados';
      }

      const baseUrl = `${req.protocol}://${req.get('host') ?? ''}`;

      const artigos = selecionados.map(({ groupId, groupTitle, article }) => {
        const caminho = article.caminho.trim();
        let pdfUrl: string | null = null;
        let pdfExpiraEm: string | null = null;
        if (caminho) {
          // Link assinado: abre o PDF sem login, para a IA conseguir baixar.
          const { token, expiresAt } = createShareToken(
            authReq.activeWorkspace.id,
            caminho,
          );
          pdfUrl = `${baseUrl}/api/share/pdf?t=${encodeURIComponent(token)}`;
          pdfExpiraEm = expiresAt;
        }
        return {
          chave: article.entry.key,
          grupoId: groupId,
          grupo: groupTitle,
          titulo: article.entry.fields.title ?? article.entry.key,
          ano: article.entry.fields.year ?? '',
          abstract: article.entry.fields.abstract ?? '',
          pdfUrl,
          pdfExpiraEm,
          fatoresAtuais: article.factors.map((f) => ({
            label: f.label,
            polarity: f.polarity,
            description: f.description,
          })),
        };
      });

      res.json({
        prompt: [
          'Você vai analisar artigos científicos e extrair os FATORES de qualidade de vida',
          'no trabalho (QVT) de desenvolvedores de software que cada artigo evidencia.',
          '',
          'ENTRADA (neste mesmo arquivo):',
          '- "catalogo": os fatores já cadastrados, cada um com o rótulo canônico em "label"',
          '  e suas grafias equivalentes em "grafias" (português, inglês, sinônimos).',
          '- "artigos": os artigos a analisar. Cada um traz "chave", "titulo", "ano",',
          '  "abstract", "fatoresAtuais" e "pdfUrl".',
          '',
          'COMO ANALISAR:',
          '1. Baixe e leia o PDF em "pdfUrl" quando houver. O link já está assinado e abre',
          '   sem login. O abstract sozinho raramente basta: os fatores costumam aparecer',
          '   nos resultados e na discussão.',
          '2. Extraia apenas fatores que o artigo EVIDENCIA com dados, achados ou análise',
          '   própria. Ignore os que ele apenas cita de passagem, menciona no referencial',
          '   teórico ou lista como trabalho futuro.',
          '3. O fator precisa se referir a quem PRODUZ software (desenvolvedores, equipes,',
          '   profissionais de engenharia de software). Descarte fatores relativos a',
          '   usuários, pacientes ou outras profissões.',
          '',
          'REGRA CENTRAL — DUAS GRAFIAS POR FATOR:',
          'Cada fator tem duas informações distintas, e as duas são obrigatórias:',
          '- "label": o termo EXATAMENTE como aparece escrito no artigo, no idioma e na',
          '  forma do texto original, sem traduzir, sem corrigir e sem normalizar.',
          '  Isso permite localizar o trecho no PDF com Ctrl+F. Ex.: se o artigo escreve',
          '  "work overload", "label" é "work overload" — não "Carga de trabalho".',
          '- "aliases": o rótulo CANÔNICO correspondente em "catalogo", quando o fator já',
          '  existir sob qualquer grafia, inclusive em outro idioma. É por ele que o',
          '  sistema liga a ocorrência ao fator certo em vez de criar um novo.',
          '  Ex.: label "work overload" + aliases ["Carga de trabalho"].',
          '- Se nenhuma grafia do catálogo corresponder, o fator é novo: deixe "aliases"',
          '  vazio e escreva em "label" o termo do artigo mesmo.',
          '- Não use vírgula nem ponto-e-vírgula dentro de "label": eles separam grafias.',
          '',
          'CAMPOS DA RESPOSTA:',
          '- "key": copie exatamente o valor de "chave" do artigo. Não invente nem altere.',
          '- "polarity": "positive" se o fator MELHORA o bem-estar/QVT; "negative" se PIORA.',
          '  A polaridade é do efeito do fator, não da qualidade do artigo.',
          '- "description": uma frase curta com a evidência encontrada NESTE artigo,',
          '  de preferência citando o trecho que sustenta o fator.',
          '',
          'REGRAS DE SAÍDA:',
          '- Omita da resposta os artigos em que não encontrar nenhum fator evidenciado.',
          '- Se "fatoresAtuais" já trouxer um fator, só o repita se for corrigir a',
          '  polaridade ou a descrição — o envio sobrescreve o que existe.',
          '- Não invente fatores para preencher: é melhor devolver pouco e correto.',
          '- Responda APENAS com o JSON no formato de "formatoResposta", sem comentários',
          '  nem texto em volta. Esse JSON é o arquivo que será enviado de volta ao sistema',
          '  no botão "Aplicar delta em artigos".',
        ].join('\n'),
        formatoResposta: {
          items: [
            {
              key: '<chave do artigo, exatamente como em "chave">',
              factors: [
                {
                  label: '<termo exato como escrito no artigo, para busca no PDF>',
                  aliases: ['<rótulo canônico do catálogo, ou omita se o fator for novo>'],
                  polarity: 'positive | negative',
                  description: '<evidência em uma frase>',
                },
              ],
            },
          ],
        },
        aviso:
          'Os links em pdfUrl dão acesso ao PDF sem login por 7 dias. Trate este arquivo como material a compartilhar deliberadamente.',
        baseUrl: `${req.protocol}://${req.get('host') ?? ''}`,
        escopo,
        resumo: {
          totalArtigos: artigos.length,
          semPdf: artigos.filter((a) => !a.pdfUrl).length,
          semAbstract: artigos.filter((a) => !a.abstract.trim()).length,
        },
        catalogo: catalogo.map((f) => ({ label: f.name, grafias: f.aliases })),
        artigos,
      });
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
