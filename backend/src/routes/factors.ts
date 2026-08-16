import { Router, type Request, type Response } from 'express';
import { ZodError, z } from 'zod';

import type { AuthenticatedRequest } from '../middleware/deviceAuth.js';
import type { Article } from '../types/referencias.js';
import { StoreError } from '../store/storeError.js';
import { createShareToken } from '../shareLinks.js';
import { allFactorSpellings, findFactorBySpelling } from '../utils/factors.js';

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

const deltaItemSchema = z.object({
  key: z.string().trim().min(1),
  /** Opcional: sem ele o artigo é procurado em todos os grupos. */
  groupId: z.number().int().optional(),
  factors: z
    .array(
      z.object({
        factorId: z.string().trim().min(1).optional(),
        /** Grafia deste artigo — é o que fica na ocorrência. */
        label: z.string().trim().min(1),
        /** Nome do fator no catálogo quando ele ainda não existe. */
        canonical: z.string().trim().min(1).optional(),
        polarity: z.enum(['positive', 'negative']).optional(),
        description: z.string().optional(),
        aliases: z.array(z.string()).optional(),
      }),
    )
    .min(1),
});

/**
 * Operação de catálogo dentro do delta, aplicada ANTES dos artigos: renomeia
 * um fator, soma grafias ou substitui o conjunto inteiro de grafias.
 */
const deltaFactorOpSchema = z.object({
  /** Qualquer grafia atual do fator (nome ou alias) — é assim que ele é achado. */
  match: z.string().trim().min(1),
  /** Novo nome canônico; o nome antigo é preservado como grafia. */
  name: z.string().trim().min(1).optional(),
  /** Grafias a somar às existentes. */
  aliases: z.array(z.string()).optional(),
  /** Substitui TODAS as grafias (o que ficar de fora se perde); ignora "aliases". */
  spellings: z.array(z.string()).optional(),
});

const deltaSchema = z
  .object({
    factors: z.array(deltaFactorOpSchema).max(5000).optional(),
    items: z.array(deltaItemSchema).max(5000).optional(),
  })
  .refine((body) => (body.factors?.length ?? 0) + (body.items?.length ?? 0) > 0, {
    message: 'Arquivo sem itens',
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
   *
   * ATENÇÃO: as regras abaixo existem em dois lugares — aqui (para qualquer IA,
   * já que viajam dentro do arquivo) e em
   * .claude/skills/analise-fatores-qvt/SKILL.md (versão com o raciocínio).
   * Elas já divergiram uma vez: ao mudar uma, mude a outra.
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
          'TRIAGEM — antes de extrair fatores, responda três perguntas sobre o artigo:',
          '(1) é da área de engenharia de software? (2) fala de desenvolvimento de',
          'software? (3) os sujeitos estudados são desenvolvedores?',
          'Se QUALQUER resposta for não, NÃO inclua o artigo no delta: apenas informe',
          'qual pergunta reprovou. Propostas de workshop, editoriais e artigos sobre',
          'usuários finais tipicamente reprovam — não têm dados nem sujeitos próprios.',
          '',
          'O QUE CONTA COMO FATOR:',
          '- Fator é aquilo que INFLUENCIA o bem-estar/QVT: práticas, condições de',
          '  trabalho, gestão, ferramentas, relações, carga, estabilidade.',
          '- NÃO liste o desfecho como fator. Em artigos que usam um modelo teórico, as',
          '  variáveis do modelo (p. ex. as necessidades da Self-Determination Theory:',
          '  autonomia, competência, pertencimento; ou "bem-estar", "satisfação",',
          '  "burnout" quando são o resultado medido) são o QUE É AFETADO — o fator é o',
          '  que age sobre elas (mentoria, microgerenciamento, demissões, prazos...).',
          '- Não use nome de produto como fator. Generalize: "Copilot" e "ChatGPT" viram',
          '  "ferramentas de IA para codificação".',
          '- Agrupe o que é o mesmo construto em vez de repetir: demissões e insegurança',
          '  no emprego, mentoria e apoio de pares, chefe apoiador e microgerenciamento',
          '  são pares — escolha o fator e use "polarity" para o sentido do efeito.',
          '- Prefira poucos fatores bem sustentados. Acima de ~8 por artigo, revise se',
          '  não está fatiando o mesmo conceito.',
          '',
          'REGRA CENTRAL — TRÊS CAMPOS POR FATOR:',
          '- "label": o termo EXATAMENTE como aparece escrito no artigo, no idioma e na',
          '  forma do texto original, sem traduzir nem normalizar. Serve para localizar',
          '  o trecho no PDF com Ctrl+F. Ex.: "constant pressure to learn new skills".',
          '- "canonical": o nome do fator no catálogo — curto, substantivo, no singular e',
          '  em português. É o que aparece na lista de fatores do sistema.',
          '  Ex.: label "constant pressure to learn new skills" + canonical',
          '  "Pressão por atualização".',
          '- "aliases": o rótulo canônico correspondente em "catalogo" QUANDO o fator já',
          '  existir lá sob qualquer grafia, inclusive em outro idioma. É por ele que o',
          '  sistema liga a ocorrência ao fator existente em vez de criar outro.',
          '  Se o fator já existe, repita esse mesmo rótulo em "canonical".',
          '  Se não existir em "catalogo", deixe "aliases" vazio e proponha o',
          '  "canonical" novo.',
          '  Além do rótulo do catálogo, "aliases" pode trazer outros sinônimos do',
          '  fator encontrados no artigo, em PT ou EN (ex.: "Upskilling", "Layoffs"):',
          '  todos viram grafias do fator no catálogo.',
          '- Não use vírgula nem ponto-e-vírgula dentro de "label", de "canonical" nem',
          '  de um item de "aliases": eles separam grafias.',
          '',
          'CAMPOS DA RESPOSTA:',
          '- "key": copie exatamente o valor de "chave" do artigo. Não invente nem altere.',
          '- "groupId": copie o "grupoId" do artigo, como NÚMERO (sem aspas). Quando a',
          '  mesma chave existe em mais de um grupo, sem ele o item é pulado.',
          '- "aliases": fator novo sem sinônimo leva lista vazia.',
          '- "polarity": "positive" se o fator MELHORA o bem-estar/QVT; "negative" se PIORA.',
          '  A polaridade é do efeito do fator, não da qualidade do artigo.',
          '- "description": duas partes — um resumo da evidência em português (com',
          '  seção e participantes) seguido da citação VERBATIM do trecho entre aspas,',
          '  sem traduzir. Ex.: Seção 4.2.1: prazos minaram a confiança de entregar a',
          '  tempo (P2) — “the pressure from task urgency and deadlines could lead to',
          '  feeling a lack of competence”. Vírgula é permitida aqui.',
          '',
          'EXEMPLOS (casos reais de um artigo que usa Self-Determination Theory):',
          '',
          'NÃO: {"label": "autonomy", "canonical": "Autonomia"}',
          'Por quê: no artigo, autonomia é a NECESSIDADE medida — o desfecho. O fator é',
          'o que a afeta.',
          'SIM: {"label": "the leadership team dictated specific tool use",',
          '      "canonical": "Imposição de ferramentas", "polarity": "negative"}',
          '',
          'NÃO: {"label": "Copilot", "canonical": "Copilot"}',
          'Por quê: nome de produto não casa com outros artigos que dizem "ChatGPT".',
          'SIM: {"label": "AI coding tools like Copilot",',
          '      "canonical": "Ferramentas de IA para codificação", "polarity": "positive"}',
          '',
          'NÃO: dois fatores separados "layoffs" e "job insecurity".',
          'Por quê: no artigo a insegurança é o efeito das demissões — é um construto só.',
          'SIM: um fator "Insegurança no emprego" com a evidência das demissões.',
          '',
          'NÃO: {"canonical": "task completion and delivery of results"}',
          'Por quê: nome de catálogo é rótulo curto, não a frase do texto.',
          'SIM: {"label": "task completion and delivery of results",',
          '      "canonical": "Senso de realização"}',
          '',
          'NÃO: {"label": "Pressão por atualização"} quando o artigo está em inglês.',
          'Por quê: "label" traduzido não é encontrado com Ctrl+F no PDF.',
          'SIM: {"label": "constant pressure to learn new skills",',
          '      "canonical": "Pressão por atualização"}',
          '',
          'ATENÇÃO ao reaproveitar o catálogo: se "catalogo" já tem',
          '{"label": "Carga de trabalho", "grafias": ["Workload"]} e o artigo diz',
          '"excessive workload", responda',
          '{"label": "excessive workload", "canonical": "Carga de trabalho",',
          ' "aliases": ["Carga de trabalho"]} — e NÃO crie "Sobrecarga de trabalho".',
          '',
          'ANTES DE RESPONDER, confira: nenhum "label", "canonical" ou "description"',
          'vazio; nenhuma vírgula ou ponto-e-vírgula em "label", "canonical" e itens de',
          '"aliases"; "description" traz resumo em PT + citação verbatim; "polarity"',
          'exatamente "positive" ou "negative"; "groupId" numérico.',
          '',
          'REGRAS DE SAÍDA:',
          '- Se só alguns PDFs abrirem, gere o delta apenas para os artigos que leu e',
          '  informe quais ficaram de fora. Nunca inclua item vazio ou com fatores',
          '  inventados para artigo não lido — o envio sobrescreve o que já existe.',
          '- Omita da resposta os artigos que reprovarem na triagem ou sem nenhum fator',
          '  evidenciado. Se nenhum artigo restar, responda em texto curto dizendo o',
          '  motivo (qual pergunta da triagem reprovou) em vez do JSON.',
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
              groupId: '<copie o grupoId do artigo, como número e sem aspas>',
              factors: [
                {
                  label: '<termo exato como escrito no artigo, para busca no PDF>',
                  canonical: '<nome curto do fator em português, para o catálogo>',
                  aliases: [
                    '<rótulo do catálogo se o fator já existir + sinônimos PT/EN do artigo>',
                  ],
                  polarity: 'positive | negative',
                  description: '<resumo em PT (Seção X.Y, participantes) — “citação verbatim do trecho”>',
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
   * Delta: liga fatores a artigos que JÁ existem e ajusta o catálogo.
   * "factors" (opcional) roda primeiro e pode renomear fatores ou mexer nas
   * grafias; "items" soma/atualiza os fatores de cada artigo. Nenhum artigo
   * é criado nem removido.
   */
  router.post('/apply-delta', async (req, res) => {
    try {
      const body = deltaSchema.parse(req.body ?? {});
      const store = storeFrom(req);

      let aplicados = 0;
      let fatoresAplicados = 0;
      let fatoresCatalogo = 0;
      const naoEncontrados: string[] = [];
      const fatoresNaoEncontrados: string[] = [];
      const ambiguos: { key: string; grupos: number[] }[] = [];
      const erros: { key: string; motivo: string }[] = [];

      // Catálogo primeiro: renomear antes de casar os artigos garante que os
      // itens abaixo encontrem o fator já com o nome novo (o antigo vira grafia).
      for (const op of body.factors ?? []) {
        try {
          const alvo = findFactorBySpelling(await store.listFactors(), op.match);
          if (!alvo) {
            fatoresNaoEncontrados.push(op.match);
            continue;
          }
          const nome = op.name?.trim();
          // Sem "spellings" a mudança é aditiva: nenhuma grafia existente se perde.
          const spellings = op.spellings
            ? [...(nome ? [nome] : []), ...op.spellings]
            : [
                ...(nome ? [nome] : []),
                ...allFactorSpellings(alvo),
                ...(op.aliases ?? []),
              ];
          await store.updateFactor(alvo.id, {
            ...(nome ? { name: nome } : {}),
            spellings,
          });
          fatoresCatalogo += 1;
        } catch (error) {
          erros.push({ key: `fator ${op.match}`, motivo: (error as Error).message });
        }
      }

      for (const item of body.items ?? []) {
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
              canonical: f.canonical,
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
        recebidos: (body.items ?? []).length,
        aplicados,
        fatoresAplicados,
        fatoresCatalogo,
        naoEncontrados,
        fatoresNaoEncontrados,
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
