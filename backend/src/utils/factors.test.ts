import { describe, expect, it } from 'vitest';

import type { FactorDefinition } from '../types/referencias.js';
import {
  allFactorSpellings,
  ensureFactorInCatalog,
  findFactorBySpelling,
  mergeAliases,
  normalizeFactorKey,
  replaceSpellings,
  resolveArticleFactors,
  stripPortugueseRestatement,
  tokenizeSpellings,
} from './factors.js';

/**
 * Um fator é o mesmo item analítico escrito de várias maneiras — "Autonomia",
 * "autonomy", "Autonomia no trabalho". Se duas grafias do mesmo fator deixarem
 * de resolver para o mesmo `id`, o catálogo racha em dois e a contagem de
 * artigos por fator passa a estar errada na tese, sem erro nenhum aparecer.
 */

const fator = (over: Partial<FactorDefinition> = {}): FactorDefinition => ({
  id: 'f-autonomia',
  name: 'Autonomia',
  aliases: ['autonomy'],
  category: 'Individual',
  ...over,
});

describe('normalizeFactorKey', () => {
  it('ignora caixa, acento e espaço em volta', () => {
    expect(normalizeFactorKey('  Autonomia  ')).toBe('autonomia');
    expect(normalizeFactorKey('AUTONOMIA')).toBe('autonomia');
    expect(normalizeFactorKey('Pressão')).toBe(normalizeFactorKey('pressao'));
    expect(normalizeFactorKey('Satisfação no Trabalho')).toBe('satisfacao no trabalho');
  });

  it('não confunde fatores diferentes', () => {
    expect(normalizeFactorKey('Autonomia')).not.toBe(normalizeFactorKey('Autonomia técnica'));
  });
});

describe('tokenizeSpellings', () => {
  it('separa por vírgula e pelo ponto-e-vírgula legado', () => {
    expect(tokenizeSpellings('Autonomia, autonomy')).toEqual(['Autonomia', 'autonomy']);
    expect(tokenizeSpellings('Autonomia; autonomy')).toEqual(['Autonomia', 'autonomy']);
  });

  it('deduplica sem olhar caixa nem acento, guardando a primeira grafia', () => {
    expect(tokenizeSpellings('Autonomia, AUTONOMIA, autonomia')).toEqual(['Autonomia']);
    expect(tokenizeSpellings('Pressão, pressao')).toEqual(['Pressão']);
  });

  it('descarta vazios e separadores soltos', () => {
    expect(tokenizeSpellings('Autonomia, , ;, autonomy')).toEqual(['Autonomia', 'autonomy']);
    expect(tokenizeSpellings('', null, undefined)).toEqual([]);
    expect(tokenizeSpellings(',,,')).toEqual([]);
  });

  it('junta várias fontes numa lista só', () => {
    expect(tokenizeSpellings('Autonomia', 'autonomy, autonomie')).toEqual([
      'Autonomia',
      'autonomy',
      'autonomie',
    ]);
  });
});

describe('findFactorBySpelling', () => {
  const catálogo = [fator(), fator({ id: 'f-carga', name: 'Carga de trabalho', aliases: ['workload'] })];

  it('acha pelo nome, por alias e ignorando caixa/acento', () => {
    expect(findFactorBySpelling(catálogo, 'Autonomia')?.id).toBe('f-autonomia');
    expect(findFactorBySpelling(catálogo, 'autonomy')?.id).toBe('f-autonomia');
    expect(findFactorBySpelling(catálogo, 'AUTONOMIA')?.id).toBe('f-autonomia');
    expect(findFactorBySpelling(catálogo, 'workload')?.id).toBe('f-carga');
  });

  it('acha quando a grafia digitada traz várias separadas por vírgula', () => {
    expect(findFactorBySpelling(catálogo, 'inexistente, workload')?.id).toBe('f-carga');
  });

  it('devolve undefined para grafia desconhecida ou vazia', () => {
    expect(findFactorBySpelling(catálogo, 'Salário')).toBeUndefined();
    expect(findFactorBySpelling(catálogo, '   ')).toBeUndefined();
  });

  it('allFactorSpellings lista nome e aliases sem repetir', () => {
    expect(allFactorSpellings(fator({ name: 'Autonomia', aliases: ['autonomia', 'autonomy'] })))
      .toEqual(['Autonomia', 'autonomy']);
  });
});

describe('mergeAliases', () => {
  it('acrescenta grafias novas e preserva campos que não são grafia', () => {
    const merged = mergeAliases(fator(), ['autonomie', 'AUTONOMY']);
    expect(merged.category).toBe('Individual');
    expect(merged.name).toBe('Autonomia');
    expect(merged.aliases).toContain('autonomie');
    // 'AUTONOMY' já existe como 'autonomy': não entra de novo.
    expect(merged.aliases.filter((a) => normalizeFactorKey(a) === 'autonomy')).toHaveLength(1);
  });

  it('nunca deixa o nome repetido dentro dos aliases', () => {
    const merged = mergeAliases(fator(), ['Autonomia']);
    expect(merged.aliases.map(normalizeFactorKey)).not.toContain('autonomia');
  });
});

describe('replaceSpellings', () => {
  it('mantém o nome atual quando ele continua entre as grafias', () => {
    const trocado = replaceSpellings(fator(), ['Autonomia', 'job autonomy']);
    expect(trocado.id).toBe('f-autonomia');
    expect(trocado.name).toBe('Autonomia');
    expect(trocado.aliases).toEqual(['job autonomy']);
    // Categoria não é grafia: sobrevive à troca.
    expect(trocado.category).toBe('Individual');
  });

  it('promove a primeira grafia a nome quando o nome antigo saiu da lista', () => {
    const trocado = replaceSpellings(fator(), ['Autonomia no trabalho', 'job autonomy']);
    expect(trocado.name).toBe('Autonomia no trabalho');
    expect(trocado.aliases).toEqual(['job autonomy']);
  });

  it('lista vazia zera os aliases e preserva o nome', () => {
    const trocado = replaceSpellings(fator(), []);
    expect(trocado.name).toBe('Autonomia');
    expect(trocado.aliases).toEqual([]);
  });
});

describe('ensureFactorInCatalog', () => {
  it('cria o fator quando nenhuma grafia é conhecida', () => {
    const { factor, catalog } = ensureFactorInCatalog([], {
      name: 'Reconhecimento',
      aliases: ['recognition'],
    });
    expect(catalog).toHaveLength(1);
    expect(factor.name).toBe('Reconhecimento');
    expect(allFactorSpellings(factor)).toContain('recognition');
    expect(factor.id).toBeTruthy();
  });

  it('reencontra o fator por qualquer grafia em vez de duplicar', () => {
    const inicial = [fator()];

    const porNome = ensureFactorInCatalog(inicial, { name: 'AUTONOMIA' });
    expect(porNome.factor.id).toBe('f-autonomia');
    expect(porNome.catalog).toHaveLength(1);

    const porAlias = ensureFactorInCatalog(inicial, { name: 'autonomy' });
    expect(porAlias.factor.id).toBe('f-autonomia');
    expect(porAlias.catalog).toHaveLength(1);

    const porAliasNovo = ensureFactorInCatalog(inicial, {
      name: 'Autonomia no trabalho',
      aliases: ['autonomy'],
    });
    expect(porAliasNovo.factor.id).toBe('f-autonomia');
    expect(porAliasNovo.catalog).toHaveLength(1);
  });

  it('absorve a grafia nova como alias do fator existente', () => {
    const { factor } = ensureFactorInCatalog([fator()], {
      name: 'autonomy',
      aliases: ['autonomie'],
    });
    expect(allFactorSpellings(factor)).toContain('autonomie');
  });

  it('atualiza a categoria informada e mantém a antiga quando ausente', () => {
    const comNova = ensureFactorInCatalog([fator()], {
      name: 'Autonomia',
      category: 'Organizacional',
    });
    expect(comNova.factor.category).toBe('Organizacional');

    const semCategoria = ensureFactorInCatalog([fator()], { name: 'Autonomia' });
    expect(semCategoria.factor.category).toBe('Individual');
  });

  it('recusa nome vazio', () => {
    expect(() => ensureFactorInCatalog([], { name: '   ' })).toThrow();
    expect(() => ensureFactorInCatalog([], { name: ',;' })).toThrow();
  });

  it('não altera o catálogo recebido', () => {
    const inicial = [fator()];
    const cópia = structuredClone(inicial);
    ensureFactorInCatalog(inicial, { name: 'Salário', aliases: ['salary'] });
    expect(inicial).toEqual(cópia);
  });
});

describe('resolveArticleFactors', () => {
  /**
   * A tradução PT/EN precisa ser DECLARADA em `aliases` — o código não adivinha
   * que "autonomy" é "Autonomia", e não deve: adivinhar juntaria fatores
   * distintos. Declarado o alias uma vez, toda ocorrência posterior daquela
   * grafia cai no mesmo fator.
   */
  it('resolve grafias declaradas como alias para um único id', () => {
    const { factors, catalog } = resolveArticleFactors(
      [
        { label: 'Autonomia', aliases: ['autonomy'], polarity: 'positive', description: 'a' },
        { label: 'autonomy', polarity: 'negative', description: 'b' },
      ],
      [],
    );

    expect(catalog).toHaveLength(1);
    expect(factors).toHaveLength(2);
    expect(factors[0].factorId).toBe(factors[1].factorId);
    // O `label` guarda a grafia usada naquele artigo; o id é o que consolida.
    expect(factors.map((f) => f.label)).toEqual(['Autonomia', 'autonomy']);
    expect(factors.map((f) => f.polarity)).toEqual(['positive', 'negative']);
  });

  it('sem alias declarado, grafias diferentes são fatores diferentes', () => {
    const { catalog } = resolveArticleFactors(
      [
        { label: 'Autonomia', polarity: 'positive', description: 'a' },
        { label: 'autonomy', polarity: 'positive', description: 'b' },
      ],
      [],
    );
    expect(catalog).toHaveLength(2);
  });

  it('a mesma grafia repetida não cria fator novo', () => {
    const { factors, catalog } = resolveArticleFactors(
      [
        { label: 'Autonomia', polarity: 'positive', description: 'a' },
        { label: 'AUTONOMIA', polarity: 'negative', description: 'b' },
      ],
      [],
    );
    expect(catalog).toHaveLength(1);
    expect(factors[0].factorId).toBe(factors[1].factorId);
  });

  it('descarta item sem grafia utilizável', () => {
    const { factors, catalog } = resolveArticleFactors(
      [{ label: '  ', polarity: 'positive', description: 'a' }],
      [],
    );
    expect(factors).toEqual([]);
    expect(catalog).toEqual([]);
  });

  it('cria um fator por item analítico distinto', () => {
    const { catalog } = resolveArticleFactors(
      [
        { label: 'Autonomia', polarity: 'positive', description: 'a' },
        { label: 'Carga de trabalho', polarity: 'negative', description: 'b' },
      ],
      [],
    );
    expect(catalog).toHaveLength(2);
  });

  it('reaproveita o catálogo existente', () => {
    const { factors, catalog } = resolveArticleFactors(
      [{ label: 'AUTONOMY', polarity: 'positive', description: 'a' }],
      [fator()],
    );
    expect(catalog).toHaveLength(1);
    expect(factors[0].factorId).toBe('f-autonomia');
  });
});

/**
 * O prompt antigo pedia "resumo em PT + citação verbatim", e na tela Fatores as
 * duas partes aparecem juntas — o resumo virou repetição. A limpeza só reescreve
 * o que entende por inteiro; sem referência de seção devolve `revisar`, porque
 * apagar o prefixo apagaria a única pista de onde o trecho está no PDF.
 */
describe('stripPortugueseRestatement', () => {
  it('reescreve quando reconhece seção e citação', () => {
    const r = stripPortugueseRestatement(
      'Os participantes valorizam decidir sozinhos como trabalhar (Seção 4.1.1, P9): ' +
        '“developers value the freedom to choose their own tools”.',
    );
    expect(r.tipo).toBe('reescrita');
    if (r.tipo === 'reescrita') {
      expect(r.description).toContain('Seção 4.1.1');
      expect(r.description).toContain('P9');
      expect(r.description).toContain('developers value the freedom');
      expect(r.description).not.toContain('valorizam decidir sozinhos');
    }
  });

  it('mantém a seção quando o parêntese só traz a referência', () => {
    const r = stripPortugueseRestatement(
      'Resumo qualquer (Section 3.2): “this is a verbatim quotation from the paper”.',
    );
    expect(r.tipo).toBe('reescrita');
    if (r.tipo === 'reescrita') {
      expect(r.description).toContain('Section 3.2');
    }
  });

  it('pede revisão em vez de apagar quando não há citação', () => {
    const r = stripPortugueseRestatement('Só um resumo em português, sem citação nenhuma.');
    expect(r).toEqual({ tipo: 'revisar', motivo: 'sem citação entre aspas' });
  });

  it('pede revisão quando há citação mas nenhuma referência de seção', () => {
    const r = stripPortugueseRestatement(
      'Um resumo qualquer: “this quotation has no section reference at all”.',
    );
    expect(r).toEqual({
      tipo: 'revisar',
      motivo: 'sem referência de seção antes da citação',
    });
  });

  it('deixa em paz o que já está no formato final', () => {
    const jáLimpa = 'Seção 4.1.1 (P9): “developers value the freedom to choose”.';
    expect(stripPortugueseRestatement(jáLimpa)).toEqual({ tipo: 'inalterada' });
  });

  it('trata descrição vazia como inalterada', () => {
    expect(stripPortugueseRestatement('   ')).toEqual({ tipo: 'inalterada' });
  });
});
