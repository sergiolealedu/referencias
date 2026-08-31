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

  /**
   * O `%` de percent-encoding na URL do Scopus não é comentário. Tratá-lo como
   * comentário cortava a linha no meio do valor, a chave nunca fechava e a
   * entrada inteira caía em `errors` — o que inutilizava qualquer .bib exportado
   * do Scopus, já que a URL do registro vem sempre com `%2f` no DOI.
   */
  it('aceita percent-encoding dentro do valor', () => {
    const { entries, errors } = parseBibtex(
      '@article{k1, url = {https://x.com/r?doi=10.1186%2fs13643-025-03028-2&id=40}, year = {2026} }',
    );
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0].fields.url).toBe('https://x.com/r?doi=10.1186%2fs13643-025-03028-2&id=40');
    expect(entries[0].fields.year).toBe('2026');
  });

  it('lê a entrada do Scopus como ela sai do export', () => {
    const { entries, errors } = parseBibtex(`@ARTICLE{Hagen2026,
\tauthor = {Hagen, Marte Hoff and Jaccheri, Letizia and Papavlasopoulou, Sofia},
\ttitle = {Digital psychosocial follow-up for survivors of childhood critical illness},
\tyear = {2026},
\tjournal = {Systematic Reviews},
\tvolume = {15},
\tnumber = {1},
\tdoi = {10.1186/s13643-025-03028-2},
\turl = {https://www.scopus.com/inward/record.uri?eid=2-s2.0-105028873474&doi=10.1186%2fs13643-025-03028-2&partnerID=40&md5=e0e820f789df815e2f3f1fb26ef084c7},
\tabstract = {Thematic analysis seguindo Braun and Clarke's framework. © The Author(s) 2025.},
\tauthor_keywords = {Childhood critical illness; Digitalization},
\ttype = {Article},
\tpublication_stage = {Final},
\tsource = {Scopus},
\tnote = {Cited by: 0; All Open Access, Gold Open Access}
}`);

    expect(errors).toEqual([]);
    expect(entries).toHaveLength(1);
    const { key, type, fields } = entries[0];
    expect(key).toBe('Hagen2026');
    expect(type).toBe('article');
    expect(fields.doi).toBe('10.1186/s13643-025-03028-2');
    expect(fields.journal).toBe('Systematic Reviews');
    expect(fields.volume).toBe('15');
    // Último campo sem vírgula final, e campo de nome com underscore.
    expect(fields.note).toContain('Cited by: 0');
    expect(fields.author_keywords).toContain('Digitalization');
    expect(fields.url).toContain('%2f');
  });

  /**
   * O Scopus monta a chave com sobrenome do primeiro autor + ano, e sobrenome
   * composto sai com espaço. Exigindo chave sem espaço, o `@` não casava e a
   * entrada era pulada sem nada em `errors` — perda silenciosa, concentrada em
   * nomes hispânicos, árabes e do sul da Ásia.
   */
  it('lê chave com espaço, colando as partes', () => {
    const { entries, errors } = parseBibtex(`
      @ARTICLE{Pardo Calvache2025, title = {Chimera of (Un)Happiness}, year = {2025} }
      @ARTICLE{Ur Rehman2021, title = {Mobile apps for autism}, year = {2021} }
      @ARTICLE{Abu Seman2020352, title = {Acceptance of technology}, year = {2020} }
      @ARTICLE{Salido O.2023, title = {Affective states}, year = {2023} }
    `);

    expect(errors).toEqual([]);
    expect(entries.map((e) => e.key)).toEqual([
      'PardoCalvache2025',
      'UrRehman2021',
      'AbuSeman2020352',
      'SalidoO.2023',
    ]);
    expect(entries[0].fields.title).toBe('Chimera of (Un)Happiness');
    expect(entries[3].fields.year).toBe('2023');
  });

  it('não deixa a chave atravessar a linha quando falta a vírgula', () => {
    const { entries, errors } = parseBibtex(`
      @article{semVirgula
        year = 2024
      }
      @article{boa, title = {Segue lida}, year = {2025} }
    `);
    expect(entries.map((e) => e.key)).toEqual(['boa']);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('ainda corta comentário entre os campos de uma entrada', () => {
    const { entries, errors } = parseBibtex(`
      @article{k1,
        % este campo ficou de fora de propósito
        title = {Um},
        year = {2024}
      }
    `);
    expect(errors).toEqual([]);
    expect(entries[0].fields.title).toBe('Um');
    expect(entries[0].fields.year).toBe('2024');
    expect(entries[0].fields.este).toBeUndefined();
  });
});
