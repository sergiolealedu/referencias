import { describe, expect, it } from 'vitest';

import {
  agruparPorCategoria,
  categoriaDe,
  compararFatores,
  parseAliasesText,
  parseFactorsDeltaFile,
  parseFactorsExportFile,
  SEM_CATEGORIA,
  suggestFactors,
} from './factors';

/**
 * O delta chega como arquivo produzido fora do app (a análise dos artigos) e é
 * aplicado sobre o corpus. Ler errado aqui grava fator errado no banco da tese,
 * então interessa sobretudo o que ele RECUSA: item sem chave, fator sem label,
 * arquivo sem nada aplicável.
 */

const delta = (obj: unknown) => parseFactorsDeltaFile(JSON.stringify(obj));

describe('parseFactorsDeltaFile', () => {
  it('lê itens com fatores', () => {
    const r = delta({
      items: [
        {
          key: 'silva2024',
          groupId: 3,
          factors: [
            {
              label: 'Autonomia',
              polarity: 'positive',
              description: 'Seção 4.1: “quote”.',
              aliases: ['autonomy'],
              category: 'Individual',
            },
          ],
        },
      ],
    });

    expect(r.items).toHaveLength(1);
    expect(r.items[0].key).toBe('silva2024');
    expect(r.items[0].groupId).toBe(3);
    expect(r.items[0].factors![0].label).toBe('Autonomia');
    expect(r.items[0].factors![0].aliases).toEqual(['autonomy']);
    expect(r.items[0].factors![0].category).toBe('Individual');
  });

  it('aceita a raiz como array de itens', () => {
    const r = delta([{ key: 'k1', factors: [{ label: 'Autonomia' }] }]);
    expect(r.items).toHaveLength(1);
  });

  it('polaridade diferente de negative virou positive', () => {
    const r = delta({
      items: [
        {
          key: 'k1',
          factors: [
            { label: 'A', polarity: 'negative' },
            { label: 'B', polarity: 'positive' },
            { label: 'C', polarity: 'qualquer-coisa' },
            { label: 'D' },
          ],
        },
      ],
    });
    expect(r.items[0].factors!.map((f) => f.polarity)).toEqual([
      'negative',
      'positive',
      'positive',
      'positive',
    ]);
  });

  it('lê removeFactors sozinho, sem fatores a adicionar', () => {
    const r = delta({ items: [{ key: 'k1', removeFactors: ['Autonomia', ' Carga '] }] });
    expect(r.items[0].removeFactors).toEqual(['Autonomia', 'Carga']);
    expect(r.items[0].factors).toBeUndefined();
  });

  it('lê operações de catálogo em "factors"', () => {
    const r = delta({
      factors: [{ match: 'Autonomia', name: 'Autonomia no trabalho', category: 'Individual' }],
      items: [{ key: 'k1', factors: [{ label: 'Autonomia' }] }],
    });
    expect(r.factors).toHaveLength(1);
    expect(r.factors![0].match).toBe('Autonomia');
    expect(r.factors![0].name).toBe('Autonomia no trabalho');
  });

  it('aceita só operações de catálogo, sem itens', () => {
    const r = delta({ factors: [{ match: 'Autonomia', category: 'Individual' }] });
    expect(r.factors).toHaveLength(1);
    expect(r.items).toEqual([]);
  });

  it('descarta item sem chave', () => {
    const r = delta({
      items: [
        { key: '', factors: [{ label: 'A' }] },
        { key: '   ', factors: [{ label: 'B' }] },
        { factors: [{ label: 'C' }] },
        { key: 'boa', factors: [{ label: 'D' }] },
      ],
    });
    expect(r.items.map((i) => i.key)).toEqual(['boa']);
  });

  it('descarta fator sem label e o item que fica vazio por isso', () => {
    const r = delta({
      items: [
        { key: 'k1', factors: [{ label: '' }, { polarity: 'positive' }] },
        { key: 'k2', factors: [{ label: '' }, { label: 'Sobrevive' }] },
      ],
    });
    expect(r.items.map((i) => i.key)).toEqual(['k2']);
    expect(r.items[0].factors!.map((f) => f.label)).toEqual(['Sobrevive']);
  });

  it('descarta operação de catálogo sem match', () => {
    const r = delta({
      factors: [{ name: 'sem match' }, { match: 'Autonomia' }],
      items: [{ key: 'k1', factors: [{ label: 'A' }] }],
    });
    expect(r.factors).toHaveLength(1);
    expect(r.factors![0].match).toBe('Autonomia');
  });

  it('recusa JSON inválido com mensagem clara', () => {
    expect(() => parseFactorsDeltaFile('{isto não é json')).toThrow(/JSON válido/);
  });

  it('recusa arquivo sem nada aplicável em vez de aplicar vazio', () => {
    expect(() => delta({ items: [] })).toThrow(/Nenhum item válido/);
    expect(() => delta({})).toThrow(/Nenhum item válido/);
    expect(() => delta([])).toThrow(/Nenhum item válido/);
    expect(() => delta({ items: [{ key: 'k1' }] })).toThrow(/Nenhum item válido/);
    expect(() => delta('texto solto')).toThrow(/Nenhum item válido/);
  });

  it('ignora entradas que não são objeto sem derrubar o arquivo todo', () => {
    const r = delta({ items: [null, 42, 'texto', { key: 'boa', factors: [{ label: 'A' }] }] });
    expect(r.items.map((i) => i.key)).toEqual(['boa']);
  });
});

describe('parseFactorsExportFile', () => {
  it('recusa JSON inválido', () => {
    expect(() => parseFactorsExportFile('{{{')).toThrow();
  });
});

describe('parseAliasesText', () => {
  it('separa por vírgula e descarta vazios', () => {
    expect(parseAliasesText('autonomy, autonomie,,  ')).toEqual(['autonomy', 'autonomie']);
    expect(parseAliasesText('')).toEqual([]);
  });
});

describe('categoriaDe', () => {
  it('cai em "Sem categoria" quando não há categoria utilizável', () => {
    expect(categoriaDe({ category: 'Individual' })).toBe('Individual');
    expect(categoriaDe({ category: '  ' })).toBe(SEM_CATEGORIA);
    expect(categoriaDe({ category: null })).toBe(SEM_CATEGORIA);
    expect(categoriaDe({})).toBe(SEM_CATEGORIA);
  });
});

describe('compararFatores', () => {
  const f = (name: string, articleCount: number) => ({ name, articleCount });

  it('por nome, ordena alfabeticamente ignorando acento e caixa', () => {
    const lista = [f('Zelo', 1), f('autonomia', 9), f('Ávido', 3)];
    expect([...lista].sort((a, b) => compararFatores(a, b, 'nome')).map((x) => x.name)).toEqual([
      'autonomia',
      'Ávido',
      'Zelo',
    ]);
  });

  it('por ocorrências, o mais citado primeiro', () => {
    const lista = [f('A', 1), f('B', 9), f('C', 5)];
    expect(
      [...lista].sort((a, b) => compararFatores(a, b, 'ocorrencias')).map((x) => x.name),
    ).toEqual(['B', 'C', 'A']);
  });

  /** Sem desempate estável a lista "pisca" de lugar entre renders. */
  it('empate em ocorrências desempata pelo nome', () => {
    const lista = [f('Zelo', 5), f('Autonomia', 5)];
    expect(
      [...lista].sort((a, b) => compararFatores(a, b, 'ocorrencias')).map((x) => x.name),
    ).toEqual(['Autonomia', 'Zelo']);
  });
});

describe('agruparPorCategoria', () => {
  const f = (name: string, articleCount: number, category?: string | null) => ({
    name,
    articleCount,
    category,
  });

  it('agrupa por categoria mantendo a ordem de entrada dentro do grupo', () => {
    const grupos = agruparPorCategoria(
      [f('B', 1, 'Individual'), f('A', 2, 'Individual'), f('C', 3, 'Técnico')],
      'nome',
    );
    const individual = grupos.find(([nome]) => nome === 'Individual')!;
    expect(individual[1].map((x) => x.name)).toEqual(['B', 'A']);
  });

  it('ordena os grupos alfabeticamente na ordem por nome', () => {
    const grupos = agruparPorCategoria(
      [f('x', 1, 'Técnico'), f('y', 1, 'Individual'), f('z', 1, 'Organizacional')],
      'nome',
    );
    expect(grupos.map(([nome]) => nome)).toEqual(['Individual', 'Organizacional', 'Técnico']);
  });

  it('ordena os grupos pelo total de artigos na ordem por ocorrências', () => {
    const grupos = agruparPorCategoria(
      [f('a', 1, 'Individual'), f('b', 10, 'Técnico'), f('c', 2, 'Organizacional')],
      'ocorrencias',
    );
    expect(grupos.map(([nome]) => nome)).toEqual(['Técnico', 'Organizacional', 'Individual']);
  });

  /**
   * "Sem categoria" é pendência de classificação, não um grupo que disputa
   * posição: fica por último mesmo tendo mais artigos que todos os outros.
   */
  it('deixa "Sem categoria" por último em qualquer ordem', () => {
    const fatores = [
      f('sem', 100, null),
      f('ind', 1, 'Individual'),
      f('tec', 2, 'Técnico'),
    ];

    for (const ordem of ['nome', 'ocorrencias'] as const) {
      const grupos = agruparPorCategoria(fatores, ordem);
      expect(grupos.at(-1)![0], `ordem ${ordem}`).toBe(SEM_CATEGORIA);
    }
  });

  it('lista vazia devolve nenhum grupo', () => {
    expect(agruparPorCategoria([], 'nome')).toEqual([]);
  });

  it('não perde nem duplica fator nenhum', () => {
    const fatores = [
      f('a', 1, 'Individual'),
      f('b', 2, null),
      f('c', 3, 'Técnico'),
      f('d', 4, 'Individual'),
    ];
    const agrupados = agruparPorCategoria(fatores, 'nome').flatMap(([, itens]) => itens);
    expect(agrupados).toHaveLength(fatores.length);
    expect(new Set(agrupados.map((x) => x.name)).size).toBe(fatores.length);
  });
});

describe('suggestFactors', () => {
  const catálogo = [
    { id: '1', name: 'Autonomia', aliases: ['autonomy'] },
    { id: '2', name: 'Carga de trabalho', aliases: ['workload'] },
  ];

  it('sugere por trecho do nome e por alias, ignorando acento e caixa', () => {
    expect(suggestFactors(catálogo, 'auton').map((s) => s.factor.id)).toContain('1');
    expect(suggestFactors(catálogo, 'WORK').map((s) => s.factor.id)).toContain('2');
  });

  it('não sugere nada para termo que não casa', () => {
    expect(suggestFactors(catálogo, 'zzzzz')).toEqual([]);
  });
});
