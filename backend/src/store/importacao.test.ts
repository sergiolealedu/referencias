import { describe, expect, it } from 'vitest';

import { SqliteStore } from './sqliteStore.js';

/**
 * A importação é onde o corpus ganha registro, e a chave de citação é a
 * identidade que o resto do sistema usa — deduplicação, vínculo com grupo de
 * origem, `\cite` no Overleaf.
 *
 * O Scopus monta essa chave com sobrenome do primeiro autor + ano. Volume de
 * anais não tem autor, então a chave sai só com o ano, IGUAL para todos os
 * volumes do mesmo ano. Num export de 57 registros isso deu onze entradas
 * disputando três chaves (`2026` seis vezes, `2023` três, `2024` duas), e a
 * importação descartava oito delas como "já existe neste grupo" — mensagem
 * falsa: eram registros diferentes. Oito artigos apagados em silêncio, e o total
 * de recuperados deixando de fechar, que é o que um levantamento sistemático
 * precisa poder demonstrar.
 *
 * Aqui se confere que colisão DENTRO do arquivo é renomeada e entra, sem
 * atropelar a outra garantia: reimportar o mesmo arquivo não pode duplicar nada.
 */

const entrada = (key: string, title = `Título ${key}`) => ({
  type: 'article',
  key,
  fields: { title, year: key.replace(/\D/g, '') || '2024' },
});

async function grupoVazio() {
  const store = new SqliteStore(':memory:');
  const grupo = await store.createGroup({ title: 'Importação' });
  return { store, grupoId: grupo.id };
}

const OPCOES = { source: 'Scopus' };

describe('importBibtex — colisão de chave', () => {
  it('importa todas as entradas que disputam a mesma chave', async () => {
    const { store, grupoId } = await grupoVazio();

    const r = await store.importBibtex(
      grupoId,
      [
        entrada('2026', 'ICISMED 2025'),
        entrada('2026', 'HealthTech 2025'),
        entrada('2026', 'IFKAD 2025'),
      ],
      OPCOES,
    );

    expect(r.parsed).toBe(3);
    expect(r.imported).toBe(3);
    expect(r.skipped).toBe(0);
    expect(r.items.map((i) => i.key)).toEqual(['2026', '2026a', '2026b']);
    // Nada de perder o registro: os três títulos estão no grupo.
    const { items } = await store.listArticles(grupoId, {});
    expect(items.map((a) => a.entry.fields.title).sort()).toEqual([
      'HealthTech 2025',
      'ICISMED 2025',
      'IFKAD 2025',
    ]);
  });

  it('diz no relatório qual chave foi renomeada', async () => {
    const { store, grupoId } = await grupoVazio();
    const r = await store.importBibtex(grupoId, [entrada('2026'), entrada('2026')], OPCOES);

    expect(r.items[0].message).toBeUndefined();
    expect(r.items[1].key).toBe('2026a');
    expect(r.items[1].message).toContain('2026');
    expect(r.items[1].message).toContain('renomeada');
  });

  /**
   * A garantia que não pode quebrar: o sufixo é determinístico, então a segunda
   * passada do MESMO arquivo reconhece tudo que já entrou e não grava nada.
   */
  it('reimportar o mesmo arquivo não duplica', async () => {
    const { store, grupoId } = await grupoVazio();
    const arquivo = [entrada('2026'), entrada('2026'), entrada('Silva2024')];

    const primeira = await store.importBibtex(grupoId, arquivo, OPCOES);
    expect(primeira.imported).toBe(3);

    const segunda = await store.importBibtex(grupoId, arquivo, OPCOES);
    expect(segunda.imported).toBe(0);
    expect(segunda.skipped).toBe(3);

    const { items } = await store.listArticles(grupoId, {});
    expect(items).toHaveLength(3);
  });

  it('chave vinda de importação anterior continua sendo ignorada', async () => {
    const { store, grupoId } = await grupoVazio();
    await store.importBibtex(grupoId, [entrada('Silva2024')], OPCOES);

    const r = await store.importBibtex(grupoId, [entrada('Silva2024')], OPCOES);
    expect(r.imported).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.items[0].outcome).toBe('skipped');
    expect(r.items[0].message).toBe('Já existe neste grupo');
  });

  it('não confunde grupos: a mesma chave entra em grupo diferente', async () => {
    const { store, grupoId } = await grupoVazio();
    const outro = await store.createGroup({ title: 'Outra busca' });

    await store.importBibtex(grupoId, [entrada('Silva2024')], OPCOES);
    const r = await store.importBibtex(outro.id, [entrada('Silva2024')], OPCOES);

    expect(r.imported).toBe(1);
    expect(r.skipped).toBe(0);
  });

  it('passa de 26 colisões caindo para sufixo numérico', async () => {
    const { store, grupoId } = await grupoVazio();
    const muitas = Array.from({ length: 28 }, () => entrada('2026'));

    const r = await store.importBibtex(grupoId, muitas, OPCOES);
    expect(r.imported).toBe(28);
    const chaves = r.items.map((i) => i.key);
    expect(new Set(chaves).size).toBe(28);
    // A primeira não leva sufixo, então `a`..`z` cobre os índices 1 a 26.
    expect(chaves[0]).toBe('2026');
    expect(chaves[26]).toBe('2026z');
    expect(chaves[27]).toBe('2026-2');
  });
});
