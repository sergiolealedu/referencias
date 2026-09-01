import { describe, expect, it } from 'vitest';

import { SqliteStore } from './sqliteStore.js';

/**
 * A descrição do fator é a definição dele para a indústria: uma por fator, e
 * escrita à mão. O risco não é gravá-la — é apagá-la sem ninguém pedir.
 *
 * `writeFactorCatalog` faz upsert do catálogo inteiro, e roda a CADA gravação de
 * fator de artigo. Quem escreve fator num artigo não informa a descrição do
 * catálogo, então se esse caminho reconstruísse a definição em vez de preservá-la,
 * uma análise de fatores apagaria o parágrafo de todos os fatores que tocasse —
 * em silêncio, e sem nada no relatório.
 */

const OPCOES = { source: 'teste' };

async function comFator(descricao: string) {
  const store = new SqliteStore(':memory:');
  const fator = await store.ensureFactor({
    name: 'Autonomia',
    aliases: ['autonomy'],
    category: 'Individual',
    description: descricao,
  });
  return { store, fator };
}

const DESCRICAO =
  'Quanto a pessoa decide como fazer o próprio trabalho: escolher a abordagem ' +
  'técnica, a ordem das tarefas e o próprio ritmo, sem precisar de aprovação a ' +
  'cada passo.';

describe('descrição do fator no catálogo', () => {
  it('grava e devolve a descrição', async () => {
    const { store, fator } = await comFator(DESCRICAO);
    expect(fator.description).toBe(DESCRICAO);

    const [doCatalogo] = await store.listFactors();
    expect(doCatalogo.description).toBe(DESCRICAO);
  });

  it('sobrevive à gravação de fatores num artigo', async () => {
    const { store } = await comFator(DESCRICAO);
    const grupo = await store.createGroup({ title: 'G' });
    await store.importBibtex(
      grupo.id,
      [{ type: 'article', key: 'Silva2024', fields: { title: 'T', year: '2024' } }],
      OPCOES,
    );

    // O caminho real da análise: grava a ocorrência sem dizer nada da descrição.
    await store.updateArticle(grupo.id, 'Silva2024', {
      factors: [
        {
          label: 'autonomy',
          polarity: 'positive',
          description: 'evidência deste artigo, não a definição do fator',
        },
      ],
    });

    const [doCatalogo] = await store.listFactors();
    expect(doCatalogo.description).toBe(DESCRICAO);
  });

  it('não confunde a descrição do catálogo com a da ocorrência', async () => {
    const { store } = await comFator(DESCRICAO);
    const grupo = await store.createGroup({ title: 'G' });
    await store.importBibtex(
      grupo.id,
      [{ type: 'article', key: 'Silva2024', fields: { title: 'T', year: '2024' } }],
      OPCOES,
    );
    await store.updateArticle(grupo.id, 'Silva2024', {
      factors: [
        { label: 'autonomy', polarity: 'positive', description: 'achado do artigo' },
      ],
    });

    const [overview] = await store.listFactorOverviews();
    expect(overview.description).toBe(DESCRICAO);
    expect(overview.occurrences[0].description).toBe('achado do artigo');
  });

  it('ensureFactor sem descrição preserva a existente', async () => {
    const { store } = await comFator(DESCRICAO);
    await store.ensureFactor({ name: 'Autonomia', aliases: ['autonomia técnica'] });

    const [doCatalogo] = await store.listFactors();
    expect(doCatalogo.description).toBe(DESCRICAO);
    // E a grafia nova entrou de verdade.
    expect(doCatalogo.aliases).toContain('autonomia técnica');
  });

  it('updateFactor com string vazia limpa, undefined mantém', async () => {
    const { store, fator } = await comFator(DESCRICAO);

    await store.updateFactor(fator.id, { name: 'Autonomia no trabalho' });
    expect((await store.listFactors())[0].description).toBe(DESCRICAO);

    await store.updateFactor(fator.id, { description: '' });
    expect((await store.listFactors())[0].description).toBeNull();
  });

  it('fator sem descrição devolve null, não undefined', async () => {
    const store = new SqliteStore(':memory:');
    await store.ensureFactor({ name: 'Carga de trabalho' });
    expect((await store.listFactors())[0].description).toBeNull();
  });
});
