import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../data');
const SECRET_FILE = resolve(DATA_ROOT, 'share-link-secret');

export const DEFAULT_SHARE_TTL_HOURS = 24 * 7;
const MAX_SHARE_TTL_HOURS = 24 * 30;

/**
 * Segredo estável entre reinícios: se fosse gerado em memória, todo restart do
 * PM2 invalidaria os links já compartilhados.
 */
function loadSecret(): string {
  const fromEnv = process.env.SHARE_LINK_SECRET?.trim();
  if (fromEnv) return fromEnv;

  try {
    const saved = readFileSync(SECRET_FILE, 'utf8').trim();
    if (saved) return saved;
  } catch {
    // ainda não existe — gera abaixo
  }

  const generated = randomBytes(32).toString('hex');
  mkdirSync(DATA_ROOT, { recursive: true });
  writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  return generated;
}

let cachedSecret: string | null = null;
function secret(): string {
  cachedSecret ??= loadSecret();
  return cachedSecret;
}

export interface SharePayload {
  /** Workspace dono do arquivo — o link não vale para outro. */
  w: string;
  /** Caminho absoluto do PDF. */
  p: string;
  /** Expiração em epoch ms. */
  e: number;
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

function sign(data: string): string {
  return base64url(createHmac('sha256', secret()).update(data).digest());
}

export function createShareToken(
  workspaceId: string,
  filePath: string,
  ttlHours = DEFAULT_SHARE_TTL_HOURS,
): { token: string; expiresAt: string } {
  const horas = Math.min(Math.max(ttlHours, 1), MAX_SHARE_TTL_HOURS);
  const payload: SharePayload = {
    w: workspaceId,
    p: filePath,
    e: Date.now() + horas * 60 * 60 * 1000,
  };
  const body = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return {
    token: `${body}.${sign(body)}`,
    expiresAt: new Date(payload.e).toISOString(),
  };
}

export class ShareTokenError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID' | 'EXPIRED',
  ) {
    super(message);
    this.name = 'ShareTokenError';
  }
}

export function verifyShareToken(token: string): SharePayload {
  const [body, assinatura] = token.split('.');
  if (!body || !assinatura) {
    throw new ShareTokenError('Link inválido.', 'INVALID');
  }

  const esperada = Buffer.from(sign(body));
  const recebida = Buffer.from(assinatura);
  // Comprimentos diferentes fazem timingSafeEqual lançar, então checa antes.
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) {
    throw new ShareTokenError('Link inválido.', 'INVALID');
  }

  let payload: SharePayload;
  try {
    payload = JSON.parse(fromBase64url(body).toString('utf8')) as SharePayload;
  } catch {
    throw new ShareTokenError('Link inválido.', 'INVALID');
  }

  if (typeof payload.e !== 'number' || Date.now() > payload.e) {
    throw new ShareTokenError('Link expirado. Gere um novo no aplicativo.', 'EXPIRED');
  }
  if (typeof payload.w !== 'string' || typeof payload.p !== 'string') {
    throw new ShareTokenError('Link inválido.', 'INVALID');
  }

  return payload;
}
