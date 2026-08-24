import { basename, join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  allowedPdfRootsForWorkspace,
  assertPdfBuffer,
  buildUniqueArticlePdfPath,
  isPathInsideRoots,
  PdfStorageError,
  workspacePdfRoot,
} from './pdfStorage.js';

/**
 * `isPathInsideRoots` é o único guarda entre `GET /api/files/pdf` e o disco
 * inteiro do servidor. As duas rotas que servem PDF chamam esta função; se ela
 * aceitar um caminho de fora das raízes, a API vira servidor de arquivos.
 */

const RAIZ = resolve('G:/Meu Drive/doutorado');

describe('isPathInsideRoots', () => {
  it('aceita a própria raiz e arquivos dentro dela, em qualquer profundidade', () => {
    expect(isPathInsideRoots(RAIZ, [RAIZ])).toBe(true);
    expect(isPathInsideRoots(resolve(RAIZ, 'artigo.pdf'), [RAIZ])).toBe(true);
    expect(isPathInsideRoots(resolve(RAIZ, 'grupo/2024/artigo.pdf'), [RAIZ])).toBe(true);
  });

  it('aceita quando qualquer uma das raízes contém o caminho', () => {
    const outra = resolve('D:/pdfs');
    expect(isPathInsideRoots(resolve(outra, 'x.pdf'), [RAIZ, outra])).toBe(true);
  });

  it('recusa caminho fora das raízes', () => {
    expect(isPathInsideRoots(resolve('C:/Windows/System32/config.pdf'), [RAIZ])).toBe(false);
    expect(isPathInsideRoots(resolve('D:/outro/x.pdf'), [RAIZ])).toBe(false);
  });

  it('recusa quando não há raiz nenhuma', () => {
    expect(isPathInsideRoots(resolve(RAIZ, 'artigo.pdf'), [])).toBe(false);
  });

  it('recusa travessia com .. que sai da raiz', () => {
    expect(isPathInsideRoots(`${RAIZ}/../outro/x.pdf`, [RAIZ])).toBe(false);
    expect(isPathInsideRoots(`${RAIZ}/../../x.pdf`, [RAIZ])).toBe(false);
    expect(isPathInsideRoots(`${RAIZ}/sub/../../fora.pdf`, [RAIZ])).toBe(false);
    expect(isPathInsideRoots(join(RAIZ, '..', 'outro', 'x.pdf'), [RAIZ])).toBe(false);
  });

  it('aceita .. que volta para dentro da raiz', () => {
    expect(isPathInsideRoots(`${RAIZ}/sub/../artigo.pdf`, [RAIZ])).toBe(true);
    expect(isPathInsideRoots(join(RAIZ, 'sub', '..', 'artigo.pdf'), [RAIZ])).toBe(true);
  });

  /**
   * A barra invertida é separador no Windows e caractere de nome de arquivo no
   * Linux — e a produção roda Linux enquanto o desenvolvimento é Windows.
   * Enquanto a checagem aceitava as duas barras, este caminho passava por
   * "dentro da raiz" no servidor e era recusado na máquina local: o guarda
   * ficava mais largo justamente onde está exposto.
   */
  it('recusa a barra invertida como separador em qualquer sistema', () => {
    expect(isPathInsideRoots(`${RAIZ}\\..\\outro\\x.pdf`, [RAIZ])).toBe(false);
    expect(isPathInsideRoots(`${RAIZ}\\sub\\..\\..\\fora.pdf`, [RAIZ])).toBe(false);
  });

  /**
   * O caso que uma comparação por prefixo cru erraria: "doutorado-secreto"
   * começa com "doutorado" mas é outra pasta. A função compara com o separador
   * grudado justamente para isto.
   */
  it('recusa pasta vizinha cujo nome começa igual ao da raiz', () => {
    expect(isPathInsideRoots(resolve('G:/Meu Drive/doutorado-secreto/x.pdf'), [RAIZ])).toBe(false);
    expect(isPathInsideRoots(resolve('G:/Meu Drive/doutoradoX/x.pdf'), [RAIZ])).toBe(false);
  });
});

describe('allowedPdfRootsForWorkspace', () => {
  it('acrescenta a pasta gerenciada do workspace às raízes configuradas', () => {
    const roots = allowedPdfRootsForWorkspace('tese-do-sergio', [RAIZ]);
    expect(roots).toContain(RAIZ);
    expect(roots).toContain(workspacePdfRoot('tese-do-sergio'));
  });

  /**
   * Workspace criado por quem não administra começa sem raiz configurada: os
   * uploads precisam continuar funcionando só com a pasta gerenciada.
   */
  it('sem raiz configurada, ainda permite a pasta gerenciada', () => {
    const roots = allowedPdfRootsForWorkspace('novo', []);
    const upload = buildUniqueArticlePdfPath('novo', 1, 'silva2024');
    expect(isPathInsideRoots(upload, roots)).toBe(true);
  });

  it('a pasta gerenciada de um workspace não vale para outro', () => {
    const doOutro = buildUniqueArticlePdfPath('outro', 1, 'silva2024');
    expect(isPathInsideRoots(doOutro, allowedPdfRootsForWorkspace('novo', []))).toBe(false);
  });
});

describe('buildUniqueArticlePdfPath', () => {
  it('gera nomes diferentes para a mesma chave', () => {
    const a = buildUniqueArticlePdfPath('ws', 1, 'silva2024');
    const b = buildUniqueArticlePdfPath('ws', 1, 'silva2024');
    expect(a).not.toBe(b);
    expect(a.endsWith('.pdf')).toBe(true);
  });

  /**
   * A chave vem do BibTeX, que é arquivo de fora. O sanitizador troca separador
   * por `_` — os pontos podem ficar, porque sem separador `..` é só um nome de
   * arquivo esquisito, não um salto de diretório.
   */
  it('sanitiza a chave para não escapar da pasta do workspace', () => {
    const caminho = buildUniqueArticlePdfPath('ws', 1, '../../etc/passwd');
    expect(isPathInsideRoots(caminho, [workspacePdfRoot('ws')])).toBe(true);

    expect(basename(caminho).startsWith('.._.._etc_passwd_')).toBe(true);
    expect(caminho.split(sep).at(-2)).toBe('1');
  });

  it('não deixa a chave vazia gerar nome inválido', () => {
    const caminho = buildUniqueArticlePdfPath('ws', 1, '///');
    expect(isPathInsideRoots(caminho, [workspacePdfRoot('ws')])).toBe(true);
    expect(caminho.endsWith('.pdf')).toBe(true);
  });
});

describe('assertPdfBuffer', () => {
  const pdf = (extra = 'conteudo') => Buffer.from(`%PDF-1.7\n${extra}`, 'utf8');

  it('aceita buffer que começa com %PDF-', () => {
    expect(() => assertPdfBuffer(pdf())).not.toThrow();
  });

  it('recusa buffer vazio', () => {
    expect(() => assertPdfBuffer(Buffer.alloc(0))).toThrow(PdfStorageError);
  });

  /** Um HTML de página de erro salvo como .pdf é o caso real mais comum. */
  it('recusa arquivo que não é PDF apesar do nome', () => {
    expect(() => assertPdfBuffer(Buffer.from('<html>404</html>', 'utf8'))).toThrow(PdfStorageError);
    expect(() => assertPdfBuffer(Buffer.from('PK\u0003\u0004zip', 'utf8'))).toThrow(PdfStorageError);
  });

  it('recusa acima de 50 MB', () => {
    const grande = Buffer.concat([
      Buffer.from('%PDF-', 'utf8'),
      Buffer.alloc(50 * 1024 * 1024),
    ]);
    expect(() => assertPdfBuffer(grande)).toThrow(/50 MB/);
  });
});
