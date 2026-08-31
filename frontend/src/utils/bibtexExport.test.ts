import { describe, expect, it } from 'vitest';

import type { Article } from '../types/referencias';
import {
  articleToBibtex,
  articlesToBibtex,
  BIBTEX_CORE_FIELDS,
  collectBibtexFieldNames,
  isCoreBibtexField,
} from './bibtexExport';

/**
 * O .bib vai para o Overleaf, e o que o Scopus despeja em cada entrada
 * (abstract, keywords, affiliations, funding_details) multiplica o arquivo sem
 * mudar uma citação. O seletor de campos existe por isso, então o que interessa
 * aqui é o filtro NÃO deixar passar o que foi desmarcado — em qualquer das duas
 * passadas de `articleToBibtex` — e o padrão nascer sem o abstract.
 */

function artigo(fields: Record<string, string>, key = 'Silva2024'): Article {
  return {
    entry: { type: 'article', key, fields },
    status: 'exists',
    source: '',
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
  } as Article;
}

const completo = artigo({
  title: 'Developer Wellbeing',
  author: 'Silva, A.',
  journal: 'JSS',
  year: '2024',
  abstract: 'Um abstract longo que nao muda a citacao.',
  keywords: 'wellbeing; developers',
  affiliations: 'Universidade X',
});

describe('articleToBibtex com seleção de campos', () => {
  it('sem opções, mantém todos os campos (export de entrada única não filtra)', () => {
    const bib = articleToBibtex(completo);
    expect(bib).toContain('abstract = {');
    expect(bib).toContain('keywords = {');
    expect(bib).toContain('affiliations = {');
  });

  it('mantém só os campos selecionados', () => {
    const bib = articleToBibtex(completo, { fields: ['title', 'author', 'year'] });
    expect(bib).toContain('title = {Developer Wellbeing},');
    expect(bib).toContain('author = {Silva, A.},');
    expect(bib).toContain('year = {2024},');
    expect(bib).not.toContain('abstract');
    expect(bib).not.toContain('keywords');
    expect(bib).not.toContain('journal');
  });

  /**
   * `abstract` está em PREFERRED_FIELD_ORDER e `keywords` não: os dois saem por
   * passadas diferentes da função. Desmarcar tem de valer nas duas — foi onde a
   * marcação de `used` precisou passar a registrar campo tratado, não incluído.
   */
  it('corta campo preferido e campo alfabético com a mesma seleção', () => {
    const bib = articleToBibtex(completo, { fields: ['title'] });
    expect(bib).not.toContain('abstract');
    expect(bib).not.toContain('keywords');
    expect(bib).not.toContain('affiliations');
    expect(bib.split('\n').filter((l) => l.includes(' = {'))).toHaveLength(1);
  });

  it('preserva a chave e o tipo mesmo sem nenhum campo', () => {
    const bib = articleToBibtex(completo, { fields: [] });
    expect(bib).toBe('@article{Silva2024,\n}');
  });

  it('ignora a caixa do nome do campo', () => {
    const bib = articleToBibtex(artigo({ Title: 'X', Abstract: 'Y' }), {
      fields: ['title'],
    });
    expect(bib).toContain('Title = {X},');
    expect(bib).not.toContain('Abstract');
  });

  it('exige chave para exportar', () => {
    expect(() => articleToBibtex(artigo({ title: 'X' }, '   '))).toThrow(/Chave/);
  });
});

describe('articlesToBibtex', () => {
  it('repassa a seleção para todas as entradas', () => {
    const bib = articlesToBibtex(
      [completo, artigo({ title: 'Outro', abstract: 'tambem longo' }, 'Souza2023')],
      { fields: ['title'] },
    );
    expect(bib).not.toContain('abstract');
    expect(bib).toContain('@article{Silva2024,');
    expect(bib).toContain('@article{Souza2023,');
  });

  it('recusa lista vazia', () => {
    expect(() => articlesToBibtex([])).toThrow(/ao menos uma entrada/);
  });
});

describe('collectBibtexFieldNames', () => {
  it('conta em quantas entradas cada campo aparece', () => {
    const usos = collectBibtexFieldNames([
      artigo({ title: 'A', abstract: 'x' }, 'A1'),
      artigo({ title: 'B' }, 'B1'),
    ]);
    expect(usos).toEqual([
      { name: 'title', count: 2 },
      { name: 'abstract', count: 1 },
    ]);
  });

  it('ignora campo vazio ou só com espaço', () => {
    const nomes = collectBibtexFieldNames([artigo({ title: 'A', doi: '', url: '   ' })]).map(
      (u) => u.name,
    );
    expect(nomes).toEqual(['title']);
  });

  /** A ordem da lista é a ordem da saída: preferidos primeiro, resto alfabético. */
  it('lista na mesma ordem em que os campos sairiam no arquivo', () => {
    const nomes = collectBibtexFieldNames([
      artigo({ zzz: 'z', abstract: 'a', title: 't', keywords: 'k' }),
    ]).map((u) => u.name);
    expect(nomes).toEqual(['title', 'abstract', 'keywords', 'zzz']);
  });

  it('unifica grafias que diferem só na caixa', () => {
    const usos = collectBibtexFieldNames([
      artigo({ Title: 'A' }, 'A1'),
      artigo({ title: 'B' }, 'B1'),
    ]);
    expect(usos).toEqual([{ name: 'title', count: 2 }]);
  });
});

describe('isCoreBibtexField', () => {
  it('deixa o abstract e os metadados de base fora do padrão', () => {
    for (const campo of ['abstract', 'keywords', 'affiliations', 'url', 'isbn', 'references']) {
      expect(isCoreBibtexField(campo)).toBe(false);
    }
  });

  it('inclui os campos que mudam a citação', () => {
    for (const campo of ['title', 'author', 'journal', 'year', 'pages', 'doi']) {
      expect(isCoreBibtexField(campo)).toBe(true);
    }
  });

  it('não depende da caixa', () => {
    expect(isCoreBibtexField('Author')).toBe(true);
    expect(isCoreBibtexField('  YEAR  ')).toBe(true);
  });

  it('o conjunto padrão não tem repetição', () => {
    expect(new Set(BIBTEX_CORE_FIELDS).size).toBe(BIBTEX_CORE_FIELDS.length);
  });
});
