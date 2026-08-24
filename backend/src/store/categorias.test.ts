import { beforeEach, describe, expect, it } from 'vitest';

import { ARTICLE_CATEGORIAS, type Article, type ArticleCategoria } from '../types/referencias.js';
import { SqliteStore } from './sqliteStore.js';

/**
 * As nove categorias existem para dizer, de cada artigo, em que ponto da
 * triagem ele está — e o comentário em `sqliteStore` promete que "cada artigo
 * cai em exatamente uma". A promessa está escrita em nove predicados SQL
 * encadeados, e é fácil um deles passar a se sobrepor a outro sem que nada
 * reclame: o artigo some de um gráfico e aparece duas vezes noutro.
 *
 * A mesma classificação está escrita DUAS vezes no arquivo — em `CATEGORIA_SQL`
 * (usada no filtro da tabela) e expandida à mão dentro de
 * `getArticleStatsByYear` (usada no dashboard). Divergir é questão de tempo,
 * então aqui se confere que as duas concordam.
 */

function artigo(key: string, patch: Partial<Article> = {}): Article {
  return {
    entry: { type: 'article', key, fields: { title: `Título ${key}`, year: '2024' } },
    status: '',
    source: 'teste',
    location: '',
    caminho: '',
    notes: '',
    tags: [],
    factors: [],
    descartado: false,
    usado: false,
    revisaoLiteratura: false,
    pdfNaoEncontrado: false,
    motivoDescarte: null,
    ...patch,
  };
}

const FATOR = [{ factorId: 'f1', polarity: 'positive' as const, description: 'd', label: 'Autonomia' }];

/**
 * Um caso por combinação que a triagem produz, mais as combinações
 * contraditórias (com fator E descartado, repetido E usado) que existem no
 * banco real e são justamente onde a precedência importa.
 */
const CASOS: Array<{ key: string; patch: Partial<Article>; esperado: ArticleCategoria }> = [
  { key: 'fator', patch: { factors: FATOR }, esperado: 'comFatores' },
  // Precedência: ter fator vence repetido, usado e descartado.
  { key: 'fator-repetido', patch: { factors: FATOR, status: 'duplicate' }, esperado: 'comFatores' },
  { key: 'fator-descartado', patch: { factors: FATOR, descartado: true }, esperado: 'comFatores' },
  {
    key: 'fator-motivo',
    patch: { factors: FATOR, motivoDescarte: 'nao_dev', descartado: true },
    esperado: 'comFatores',
  },
  { key: 'repetido', patch: { status: 'duplicate' }, esperado: 'repetidos' },
  // Precedência: repetido vence usado e descartado.
  { key: 'repetido-usado', patch: { status: 'duplicate', usado: true }, esperado: 'repetidos' },
  {
    key: 'repetido-descartado',
    patch: { status: 'duplicate', descartado: true },
    esperado: 'repetidos',
  },
  { key: 'usado', patch: { usado: true }, esperado: 'usados' },
  // Precedência: usado vence motivo de descarte.
  {
    key: 'usado-com-motivo',
    patch: { usado: true, motivoDescarte: 'nao_qvt' },
    esperado: 'usados',
  },
  { key: 'nao-eng-sw', patch: { motivoDescarte: 'nao_eng_sw' }, esperado: 'naoEngSw' },
  { key: 'nao-dev', patch: { motivoDescarte: 'nao_dev' }, esperado: 'naoDev' },
  { key: 'nao-qvt', patch: { motivoDescarte: 'nao_qvt' }, esperado: 'naoQvt' },
  // Precedência: o motivo vence o descarte genérico e o PDF já baixado.
  {
    key: 'motivo-e-descartado',
    patch: { motivoDescarte: 'nao_dev', descartado: true },
    esperado: 'naoDev',
  },
  {
    key: 'motivo-com-pdf',
    patch: { motivoDescarte: 'nao_dev', caminho: 'C:/pdfs/x.pdf' },
    esperado: 'naoDev',
  },
  { key: 'descartado', patch: { descartado: true }, esperado: 'descartados' },
  // Precedência: descartado vence "com PDF" — baixar o PDF não desfaz o descarte.
  {
    key: 'descartado-com-pdf',
    patch: { descartado: true, caminho: 'C:/pdfs/y.pdf' },
    esperado: 'descartados',
  },
  { key: 'com-pdf', patch: { caminho: 'C:/pdfs/z.pdf' }, esperado: 'comPdf' },
  // Caminho só com espaços não conta como PDF (o SQL usa TRIM).
  { key: 'caminho-em-branco', patch: { caminho: '   ' }, esperado: 'outros' },
  { key: 'outros', patch: {}, esperado: 'outros' },
];

describe('categorias de artigo', () => {
  let store: SqliteStore;
  let groupId: number;

  beforeEach(async () => {
    store = new SqliteStore(':memory:');
    const group = await store.createGroup({ title: 'Grupo de teste', versao: 'v2' });
    groupId = group.id;
    for (const caso of CASOS) {
      await store.createArticle(groupId, artigo(caso.key, caso.patch));
    }
  });

  it('classifica cada caso na categoria que a precedência manda', async () => {
    for (const caso of CASOS) {
      const página = await store.listArticles(groupId, {
        categoria: caso.esperado,
        pageSize: 200,
      });
      const chaves = página.items.map((a) => a.entry.key);
      expect(chaves, `${caso.key} deveria estar em ${caso.esperado}`).toContain(caso.key);
    }
  });

  it('põe cada artigo em exatamente uma categoria', async () => {
    const ocorrências = new Map<string, ArticleCategoria[]>();

    for (const categoria of ARTICLE_CATEGORIAS) {
      const página = await store.listArticles(groupId, { categoria, pageSize: 200 });
      for (const item of página.items) {
        const lista = ocorrências.get(item.entry.key) ?? [];
        lista.push(categoria);
        ocorrências.set(item.entry.key, lista);
      }
    }

    const duplicados = [...ocorrências].filter(([, cats]) => cats.length !== 1);
    expect(duplicados, 'artigos em mais de uma categoria').toEqual([]);
    expect(ocorrências.size).toBe(CASOS.length);
  });

  it('soma das categorias fecha com o total sem filtro', async () => {
    const total = (await store.listArticles(groupId, { pageSize: 200 })).total;

    let soma = 0;
    for (const categoria of ARTICLE_CATEGORIAS) {
      soma += (await store.listArticles(groupId, { categoria, pageSize: 200 })).total;
    }

    expect(soma).toBe(total);
    expect(total).toBe(CASOS.length);
  });

  it('estatísticas por ano concordam com o filtro da tabela', async () => {
    const [stats] = store.getArticleStatsByYear('v2');
    const série = stats.series.find((s) => s.year === 2024);
    expect(série, 'série de 2024').toBeDefined();

    const contagem = async (categoria: ArticleCategoria) =>
      (await store.listArticles(groupId, { categoria, pageSize: 200 })).total;

    // Os nomes diferem entre as duas implementações; o mapa é o contrato.
    expect(série!.comFatores).toBe(await contagem('comFatores'));
    expect(série!.usados).toBe(await contagem('usados'));
    expect(série!.naoEngSw).toBe(await contagem('naoEngSw'));
    expect(série!.naoDev).toBe(await contagem('naoDev'));
    expect(série!.naoQvt).toBe(await contagem('naoQvt'));
    expect(série!.descartados).toBe(await contagem('descartados'));
    expect(série!.comPdf).toBe(await contagem('comPdf'));
    expect(série!.outros).toBe(await contagem('outros'));
    expect(série!.repetidos).toBe(await contagem('repetidos'));
  });

  /**
   * `unicos` anda num eixo próprio: conta `status != 'duplicate'`, sem olhar
   * fatores. Um artigo com fator E marcado como repetido entra em `comFatores`
   * na partição mas NÃO é único — os dois números respondem perguntas
   * diferentes (em que ponto da triagem está / é entrada repetida) e não devem
   * ser somados entre si.
   */
  it('conta como únicos os artigos cujo status não é duplicate', async () => {
    const [stats] = store.getArticleStatsByYear('v2');
    const série = stats.series.find((s) => s.year === 2024)!;
    const comStatusDuplicate = CASOS.filter((c) => c.patch.status === 'duplicate').length;

    expect(comStatusDuplicate).toBeGreaterThan(
      CASOS.filter((c) => c.esperado === 'repetidos').length,
    );
    expect(série.unicos).toBe(CASOS.length - comStatusDuplicate);
  });
});
