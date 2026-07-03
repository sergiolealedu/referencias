import type { GroupExport } from '../types/referencias';

function sanitizeFilename(title: string): string {
  return title
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'grupo';
}

export function downloadGroupExport(payload: GroupExport): void {
  const filename = `${sanitizeFilename(payload.group.title)}-${payload.group.sourceId}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseGroupExportFile(text: string): GroupExport {
  const data = JSON.parse(text) as unknown;
  if (
    !data ||
    typeof data !== 'object' ||
    !('group' in data) ||
    !('articles' in data)
  ) {
    throw new Error('Arquivo inválido: esperado exportação de grupo com metadados e artigos.');
  }
  return data as GroupExport;
}
