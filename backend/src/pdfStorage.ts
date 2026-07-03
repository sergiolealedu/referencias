import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const DATA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../data');

export function workspacePdfRoot(workspaceId: string): string {
  return resolve(DATA_ROOT, 'pdfs', workspaceId);
}

export function isPathInsideRoots(filePath: string, roots: string[]): boolean {
  const normalized = resolve(normalize(filePath));
  return roots.some((root) => {
    const allowedRoot = resolve(normalize(root));
    return (
      normalized === allowedRoot ||
      normalized.startsWith(`${allowedRoot}\\`) ||
      normalized.startsWith(`${allowedRoot}/`)
    );
  });
}

export function allowedPdfRootsForWorkspace(
  workspaceId: string,
  configuredRoots: string[],
): string[] {
  return [...configuredRoots, workspacePdfRoot(workspaceId)];
}

function safeEntryKey(entryKey: string): string {
  const safe = entryKey.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return (safe || 'article').slice(0, 120);
}

export function articlePdfPath(
  workspaceId: string,
  groupId: number,
  entryKey: string,
): string {
  return resolve(
    workspacePdfRoot(workspaceId),
    String(groupId),
    `${safeEntryKey(entryKey)}.pdf`,
  );
}

export function assertPdfBuffer(buffer: Buffer): void {
  if (!buffer?.length) {
    throw new PdfStorageError('Arquivo PDF vazio.', 'VALIDATION');
  }
  if (buffer.length > MAX_PDF_BYTES) {
    throw new PdfStorageError(
      `PDF excede o limite de ${MAX_PDF_BYTES / (1024 * 1024)} MB.`,
      'VALIDATION',
    );
  }
  const header = buffer.subarray(0, 5).toString('utf8');
  if (header !== '%PDF-') {
    throw new PdfStorageError('O arquivo enviado não é um PDF válido.', 'VALIDATION');
  }
}

export async function saveArticlePdf(
  workspaceId: string,
  groupId: number,
  entryKey: string,
  buffer: Buffer,
): Promise<string> {
  assertPdfBuffer(buffer);
  const filePath = articlePdfPath(workspaceId, groupId, entryKey);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return filePath;
}

export async function removeManagedPdf(
  workspaceId: string,
  filePath: string | null | undefined,
): Promise<void> {
  if (!filePath?.trim()) return;
  const resolved = resolve(normalize(filePath.trim()));
  if (!isPathInsideRoots(resolved, [workspacePdfRoot(workspaceId)])) {
    return;
  }
  try {
    await unlink(resolved);
  } catch {
    // Arquivo já ausente — ok.
  }
}

export class PdfStorageError extends Error {
  constructor(
    message: string,
    readonly code: 'VALIDATION' | 'NOT_FOUND' = 'VALIDATION',
  ) {
    super(message);
    this.name = 'PdfStorageError';
  }
}
