import { describe, expect, it, vi } from 'vitest';

/**
 * O link de compartilhamento é a única rota que serve PDF sem header de
 * autenticação: quem tem a URL tem o arquivo. A assinatura é o que impede
 * trocar o caminho ou o workspace dentro do próprio link e ler outro PDF, e a
 * expiração é o que impede um link antigo valer para sempre.
 *
 * O segredo vem de SHARE_LINK_SECRET quando definido — é o que permite testar
 * sem tocar em `data/share-link-secret`.
 */

process.env.SHARE_LINK_SECRET = 'segredo-de-teste-nao-usar-em-producao';

const { createShareToken, verifyShareToken, ShareTokenError, DEFAULT_SHARE_TTL_HOURS } =
  await import('./shareLinks.js');

const WORKSPACE = 'tese-do-sergio';
const PDF = 'G:\\Meu Drive\\doutorado\\artigo.pdf';

describe('createShareToken', () => {
  it('devolve token verificável com o caminho e o workspace originais', () => {
    const { token, expiresAt } = createShareToken(WORKSPACE, PDF);
    const payload = verifyShareToken(token);

    expect(payload.w).toBe(WORKSPACE);
    expect(payload.p).toBe(PDF);
    expect(new Date(expiresAt).getTime()).toBe(payload.e);
  });

  it('respeita o TTL pedido', () => {
    const antes = Date.now();
    const { token } = createShareToken(WORKSPACE, PDF, 2);
    const payload = verifyShareToken(token);
    const horas = (payload.e - antes) / (60 * 60 * 1000);
    expect(horas).toBeGreaterThan(1.9);
    expect(horas).toBeLessThan(2.1);
  });

  it('limita o TTL ao teto de 30 dias e ao piso de 1 hora', () => {
    const teto = verifyShareToken(createShareToken(WORKSPACE, PDF, 24 * 365).token);
    expect((teto.e - Date.now()) / (60 * 60 * 1000)).toBeLessThanOrEqual(24 * 30 + 0.1);

    const piso = verifyShareToken(createShareToken(WORKSPACE, PDF, 0).token);
    expect((piso.e - Date.now()) / (60 * 60 * 1000)).toBeGreaterThan(0.9);

    const negativo = verifyShareToken(createShareToken(WORKSPACE, PDF, -50).token);
    expect(negativo.e).toBeGreaterThan(Date.now());
  });

  it('usa o padrão de uma semana quando o TTL não é informado', () => {
    const payload = verifyShareToken(createShareToken(WORKSPACE, PDF).token);
    const horas = (payload.e - Date.now()) / (60 * 60 * 1000);
    expect(horas).toBeGreaterThan(DEFAULT_SHARE_TTL_HOURS - 1);
    expect(horas).toBeLessThanOrEqual(DEFAULT_SHARE_TTL_HOURS);
  });
});

describe('verifyShareToken recusa token adulterado', () => {
  it('rejeita quando o payload é trocado e a assinatura mantida', () => {
    const { token } = createShareToken(WORKSPACE, PDF);
    const [, assinatura] = token.split('.');

    const outroPayload = Buffer.from(
      JSON.stringify({ w: WORKSPACE, p: 'C:\\Windows\\secreto.pdf', e: Date.now() + 60_000 }),
      'utf8',
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(() => verifyShareToken(`${outroPayload}.${assinatura}`)).toThrow(ShareTokenError);
  });

  it('rejeita quando a assinatura é trocada', () => {
    const { token } = createShareToken(WORKSPACE, PDF);
    const [payload] = token.split('.');
    expect(() => verifyShareToken(`${payload}.assinaturafalsa`)).toThrow(ShareTokenError);
  });

  it('rejeita token sem separador, vazio ou com partes faltando', () => {
    for (const inválido of ['', '.', 'semponto', 'payload.', '.assinatura']) {
      expect(() => verifyShareToken(inválido), `token: ${inválido}`).toThrow(ShareTokenError);
    }
  });

  it('marca como INVALID, não EXPIRED, o token adulterado', () => {
    try {
      verifyShareToken('abc.def');
      expect.unreachable('deveria ter lançado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(ShareTokenError);
      expect((erro as InstanceType<typeof ShareTokenError>).code).toBe('INVALID');
    }
  });

  /**
   * A assinatura cobre o payload inteiro, workspace incluído. Sem isso um link
   * legítimo de um workspace abriria arquivo em outro, porque a rota pública usa
   * `w` para escolher as pastas permitidas.
   */
  it('não aceita o mesmo caminho assinado para outro workspace', () => {
    const doOutro = createShareToken('outro-workspace', PDF).token;
    const [payloadOutro] = doOutro.split('.');
    const [, assinaturaDaqui] = createShareToken(WORKSPACE, PDF).token.split('.');
    expect(() => verifyShareToken(`${payloadOutro}.${assinaturaDaqui}`)).toThrow(ShareTokenError);
  });
});

describe('verifyShareToken e expiração', () => {
  it('aceita antes de expirar e rejeita como EXPIRED depois', () => {
    vi.useFakeTimers();
    try {
      const { token } = createShareToken(WORKSPACE, PDF, 1);
      expect(verifyShareToken(token).p).toBe(PDF);

      vi.advanceTimersByTime(59 * 60 * 1000);
      expect(verifyShareToken(token).p).toBe(PDF);

      vi.advanceTimersByTime(2 * 60 * 1000);
      try {
        verifyShareToken(token);
        expect.unreachable('deveria ter expirado');
      } catch (erro) {
        expect((erro as InstanceType<typeof ShareTokenError>).code).toBe('EXPIRED');
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
