import { describe, expect, it } from 'vitest';

import { parseBibtex } from './bibtexParser.js';

/**
 * O parser é a porta de entrada do corpus: tudo que ele lê errado entra errado
 * na tese, e tudo que ele silenciosamente descarta nunca é triado. Interessa
 * tanto o que ele aceita quanto o que ele reporta em `errors` em vez de engolir.
 */

describe('parseBibtex', () => {
  it('lê a entrada mínima', () => {
    const { entries, errors } = parseBibtex(`
      @article{silva2024,
        title = {Quality of work life in software teams},
        author = {Silva, Ana and Souza, Bruno},
        year = {2024},
        journal = {Journal of Systems and Software}
      }
    `);

    expect(errors).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('article');
    expect(entries[0].key).toBe('silva2024');
    expect(entries[0].fields.title).toBe('Quality of work life in software teams');
    expect(entries[0].fields.author).toBe('Silva, Ana and Souza, Bruno');
    expect(entries[0].fields.year).toBe('2024');
  });

  it('lê várias entradas de tipos diferentes', () => {
    const { entries } = parseBibtex(`
      @article{a1, title = {Um} }
      @inproceedings{c1, title = {Dois} }
      @book{b1, title = {Três} }
    `);
    expect(entries.map((e) => e.key)).toEqual(['a1', 'c1', 'b1']);
    expect(entries.map((e) => e.type)).toEqual(['article', 'inproceedings', 'book']);
  });

  it('aceita valor entre aspas e chaves aninhadas', () => {
    const { entries } = parseBibtex(`
      @article{k1,
        title = "Um título entre aspas",
        booktitle = {Proc. of {IEEE} Conference on {SE}}
      }
    `);
    expect(entries[0].fields.title).toBe('Um título entre aspas');
    // As chaves internas protegem a caixa das siglas e devem sobreviver.
    expect(entries[0].fields.booktitle).toContain('IEEE');
    expect(entries[0].fields.booktitle).toContain('SE');
  });

  it('normaliza o nome do campo para minúsculas', () => {
    const { entries } = parseBibtex('@article{k1, TITLE = {Maiúsculo}, Year = {2020} }');
    expect(entries[0].fields.title).toBe('Maiúsculo');
    expect(entries[0].fields.year).toBe('2020');
  });

  it('normaliza o tipo da entrada para minúsculas', () => {
    const { entries } = parseBibtex('@ARTICLE{k1, title = {Um} }');
    expect(entries[0].type).toBe('article');
  });

  it('ignora comentário de linha, mas respeita o %% escapado', () => {
    const { entries } = parseBibtex(`
      % isto é um comentário e não deve virar entrada
      @article{k1,
        title = {Cobertura de 80\\% dos casos},
        year = {2024} % comentário no fim da linha
      }
    `);
    expect(entries).toHaveLength(1);
    expect(entries[0].fields.title).toContain('80');
    expect(entries[0].fields.year).toBe('2024');
  });

  it('aceita vírgula sobrando depois do último campo', () => {
    const { entries, errors } = parseBibtex('@article{k1, title = {Um}, year = {2024}, }');
    expect(errors).toEqual([]);
    expect(entries[0].fields.year).toBe('2024');
  });

  it('não produz entrada nenhuma para conteúdo vazio', () => {
    expect(parseBibtex('').entries).toEqual([]);
    expect(parseBibtex('   \n  \n').entries).toEqual([]);
  });

  /**
   * O caso que mais importa: entrada quebrada precisa aparecer em `errors`, não
   * desaparecer. Um artigo que o parser descarta em silêncio nunca é triado e
   * ninguém percebe que faltou.
   */
  it('reporta a entrada com chave de fechamento faltando em vez de engoli-la', () => {
    const { entries, errors } = parseBibtex(`
      @article{completa, title = {Esta fecha}, year = {2024} }
      @article{truncada, title = {Esta não fecha
    `);

    expect(entries.map((e) => e.key)).toContain('completa');
    expect(entries.map((e) => e.key)).not.toContain('truncada');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.key === 'truncada' || e.reason)).toBe(true);
  });

  it('reporta entrada sem chave de citação', () => {
    const { errors } = parseBibtex('@article{, title = {Sem chave} }');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('uma entrada quebrada não impede a leitura das seguintes', () => {
    const { entries } = parseBibtex(`
      @article{boa1, title = {Primeira}, year = {2020} }
      @article{, title = {Quebrada} }
      @article{boa2, title = {Terceira}, year = {2022} }
    `);
    const chaves = entries.map((e) => e.key);
    expect(chaves).toContain('boa1');
    expect(chaves).toContain('boa2');
  });

  it('preserva o DOI, que é a identidade usada na deduplicação', () => {
    const { entries } = parseBibtex(
      '@article{k1, title = {Um}, doi = {10.1109/TSE.2024.1234567} }',
    );
    expect(entries[0].fields.doi).toBe('10.1109/TSE.2024.1234567');
  });
});
