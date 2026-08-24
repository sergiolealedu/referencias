import { describe, expect, it } from 'vitest';

import type { GroupArticleStats, YearArticleStats } from '../types/referencias';
import {
  buildChartData,
  buildConsolidatedSeries,
  DUPLICATE_SEGMENTS,
  initialVisibility,
  segmentsForMode,
  sumSeries,
  USAGE_SEGMENTS,
} from './dashboardSeries';

/**
 * São estas funções que produzem os números do dashboard — os mesmos que vão
 * para a tese. Um erro aqui não aparece como erro: aparece como barra de altura
 * errada num gráfico que ninguém confere contra o banco.
 */

const ponto = (year: number, over: Partial<YearArticleStats> = {}): YearArticleStats => ({
  year,
  comFatores: 0,
  usados: 0,
  comPdf: 0,
  naoEngSw: 0,
  naoDev: 0,
  naoQvt: 0,
  descartados: 0,
  outros: 0,
  unicos: 0,
  repetidos: 0,
  ...over,
});

const grupo = (id: number, series: YearArticleStats[]): GroupArticleStats => ({
  groupId: id,
  groupTitle: `Grupo ${id}`,
  versao: 'v2',
  series,
});

describe('segmentsForMode e initialVisibility', () => {
  it('modo duplicatas usa só únicos e repetidos', () => {
    expect(segmentsForMode('duplicates')).toBe(DUPLICATE_SEGMENTS);
    expect(segmentsForMode('duplicates').map((s) => s.key)).toEqual(['unicos', 'repetidos']);
  });

  it('modo uso abre com "com fator" e fecha com "repetidos"', () => {
    const chaves = segmentsForMode('usage').map((s) => s.key);
    expect(segmentsForMode('usage')).toBe(USAGE_SEGMENTS);
    // Ter fator é o estado mais avançado da análise: abre o empilhamento.
    expect(chaves[0]).toBe('comFatores');
    // Repetido fica por último para não deslocar a ordem das demais.
    expect(chaves.at(-1)).toBe('repetidos');
  });

  it('todos os segmentos começam visíveis', () => {
    for (const modo of ['usage', 'duplicates'] as const) {
      const visiveis = initialVisibility(modo);
      expect(Object.values(visiveis).every(Boolean), `modo ${modo}`).toBe(true);
      expect(Object.keys(visiveis)).toHaveLength(segmentsForMode(modo).length);
    }
  });
});

describe('buildChartData', () => {
  it('série vazia não gera ponto nenhum', () => {
    expect(buildChartData([])).toEqual([]);
  });

  it('ordena por ano', () => {
    const dados = buildChartData([ponto(2022), ponto(2020), ponto(2021)]);
    expect(dados.map((p) => p.year)).toEqual(['2020', '2021', '2022']);
  });

  /**
   * Um ano sem artigo nenhum precisa aparecer com zero, senão o eixo "pula" de
   * 2019 para 2023 e o gráfico sugere continuidade onde há um buraco.
   */
  it('preenche com zero os anos sem dado dentro do intervalo', () => {
    const dados = buildChartData([ponto(2020, { usados: 3 }), ponto(2023, { usados: 5 })]);
    expect(dados.map((p) => p.year)).toEqual(['2020', '2021', '2022', '2023']);
    expect(dados[1].usados).toBe(0);
    expect(dados[1].total).toBe(0);
  });

  /**
   * Acima de 15 anos de intervalo o preenchimento pararia de ajudar: viraria
   * uma fileira de barras vazias. Aí só os anos com dado entram.
   */
  it('acima de 15 anos de intervalo não preenche', () => {
    const dados = buildChartData([ponto(1990), ponto(2024)]);
    expect(dados.map((p) => p.year)).toEqual(['1990', '2024']);
  });

  it('preenche exatamente no limite de 15 anos', () => {
    const dados = buildChartData([ponto(2010), ponto(2025)]);
    expect(dados).toHaveLength(16);
  });

  /**
   * `total` soma as nove categorias da partição — `unicos` fica fora, porque
   * anda no outro eixo (é entrada repetida ou não) e somá-lo contaria o mesmo
   * artigo duas vezes.
   */
  it('total soma as categorias da partição e ignora unicos', () => {
    const [p] = buildChartData([
      ponto(2024, {
        comFatores: 1,
        usados: 2,
        comPdf: 3,
        naoEngSw: 4,
        naoDev: 5,
        naoQvt: 6,
        descartados: 7,
        outros: 8,
        repetidos: 9,
        unicos: 1000,
      }),
    ]);
    expect(p.total).toBe(1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9);
    expect(p.unicos).toBe(1000);
  });

  it('não altera a série recebida', () => {
    const série = [ponto(2022), ponto(2020)];
    const cópia = structuredClone(série);
    buildChartData(série);
    expect(série).toEqual(cópia);
  });
});

describe('sumSeries', () => {
  it('série vazia soma zero em tudo', () => {
    const total = sumSeries([]);
    expect(Object.values(total).every((v) => v === 0)).toBe(true);
  });

  it('soma campo a campo ao longo dos anos', () => {
    const total = sumSeries([
      ponto(2020, { usados: 2, comFatores: 1, unicos: 10 }),
      ponto(2021, { usados: 3, comFatores: 4, unicos: 20 }),
    ]);
    expect(total.usados).toBe(5);
    expect(total.comFatores).toBe(5);
    expect(total.unicos).toBe(30);
  });

  it('não vaza o acumulador entre chamadas', () => {
    const série = [ponto(2020, { usados: 2 })];
    expect(sumSeries(série).usados).toBe(2);
    expect(sumSeries(série).usados).toBe(2);
  });
});

describe('buildConsolidatedSeries', () => {
  it('sem grupo, série vazia', () => {
    expect(buildConsolidatedSeries([])).toEqual([]);
  });

  it('soma o mesmo ano entre grupos diferentes', () => {
    const consolidada = buildConsolidatedSeries([
      grupo(1, [ponto(2020, { usados: 2 })]),
      grupo(2, [ponto(2020, { usados: 3 })]),
    ]);
    expect(consolidada).toHaveLength(1);
    expect(consolidada[0].year).toBe(2020);
    expect(consolidada[0].usados).toBe(5);
  });

  it('mantém anos distintos e ordenados', () => {
    const consolidada = buildConsolidatedSeries([
      grupo(1, [ponto(2023, { usados: 1 })]),
      grupo(2, [ponto(2020, { usados: 1 }), ponto(2021, { usados: 1 })]),
    ]);
    expect(consolidada.map((p) => p.year)).toEqual([2020, 2021, 2023]);
  });

  it('preserva o total geral: consolidar e somar dá o mesmo que somar cada grupo', () => {
    const grupos = [
      grupo(1, [ponto(2020, { usados: 2, comFatores: 1 }), ponto(2021, { usados: 3 })]),
      grupo(2, [ponto(2020, { usados: 5 }), ponto(2022, { comFatores: 7 })]),
    ];

    const viaConsolidacao = sumSeries(buildConsolidatedSeries(grupos));
    const viaGrupos = grupos
      .map((g) => sumSeries(g.series))
      .reduce((a, b) => ({
        ...a,
        usados: a.usados + b.usados,
        comFatores: a.comFatores + b.comFatores,
      }));

    expect(viaConsolidacao.usados).toBe(viaGrupos.usados);
    expect(viaConsolidacao.comFatores).toBe(viaGrupos.comFatores);
    expect(viaConsolidacao.usados).toBe(10);
    expect(viaConsolidacao.comFatores).toBe(8);
  });

  it('não altera os grupos recebidos', () => {
    const grupos = [grupo(1, [ponto(2020, { usados: 2 })])];
    const cópia = structuredClone(grupos);
    buildConsolidatedSeries(grupos);
    expect(grupos).toEqual(cópia);
  });
});
