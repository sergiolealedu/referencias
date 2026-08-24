import { describe, expect, it } from 'vitest';

import { SqliteStore } from './sqliteStore.js';

/**
 * O id do grupo vinha de `Date.now()` puro. Vinte grupos criados num laço —
 * importação, script de migração, dois cliques rápidos — caem no mesmo
 * milissegundo e batem no PRIMARY KEY.
 */
describe('createGroup', () => {
  it('não colide ao criar muitos grupos em sequência', async () => {
    const store = new SqliteStore(':memory:');
    const ids: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      ids.push((await store.createGroup({ title: `Grupo ${i}` })).id);
    }
    expect(new Set(ids).size).toBe(50);
  });

  it('gera ids crescentes', async () => {
    const store = new SqliteStore(':memory:');
    const a = await store.createGroup({ title: 'A' });
    const b = await store.createGroup({ title: 'B' });
    expect(b.id).toBeGreaterThan(a.id);
  });

  /**
   * `duplicate_group_id` não tem FK: um artigo pode apontar para um grupo já
   * apagado. Se o id fosse reusado, esse artigo passaria a apontar para o grupo
   * novo — vínculo de duplicata inventado.
   */
  it('não reusa o id de um grupo apagado', async () => {
    const store = new SqliteStore(':memory:');
    const primeiro = await store.createGroup({ title: 'Vai ser apagado' });
    await store.deleteGroup(primeiro.id);

    const segundo = await store.createGroup({ title: 'Novo' });
    expect(segundo.id).not.toBe(primeiro.id);
    expect(segundo.id).toBeGreaterThan(primeiro.id);
  });

  it('preenche os padrões de versão e mecanismo', async () => {
    const store = new SqliteStore(':memory:');
    const grupo = await store.createGroup({ title: 'Só título' });
    expect(grupo.versao).toBe('v2');
    expect(grupo.mecanismo).toBe('Scopus');
    expect(grupo.articleCount).toBe(0);
  });
});
