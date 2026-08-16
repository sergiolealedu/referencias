import type { AbstractsExport, GroupExport } from '../types/referencias';
import { MOTIVO_DESCARTE_LABELS } from '../types/referencias';

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

function describeSituacao(article: AbstractsExport['articles'][number]): string {
  const partes: string[] = [];
  if (article.status === 'duplicate') partes.push('REPETIDO');
  if (article.motivoDescarte) partes.push(MOTIVO_DESCARTE_LABELS[article.motivoDescarte]);
  else if (article.descartado) partes.push('descartado (sem motivo)');
  if (article.pdfNaoEncontrado) partes.push('PDF não encontrado');
  if (article.temPdf) partes.push('tem PDF');
  return partes.length ? partes.join(' · ') : 'sem marcação';
}

/**
 * Texto corrido com os abstracts dos artigos não usados — o formato é para
 * leitura/revisão, não para reimportar.
 */
export function downloadAbstractsNaoUsados(payload: AbstractsExport): void {
  const { group, articles } = payload;
  const semAbstract = articles.filter((a) => !a.abstract.trim()).length;

  const cabecalho = [
    `Grupo: ${group.title} (${group.versao})`,
    `Artigos não marcados como usado: ${articles.length}`,
    `Sem abstract cadastrado: ${semAbstract}`,
    '',
    'Revise se algum destes deveria estar em uso.',
    '='.repeat(72),
    '',
  ].join('\n');

  const corpo = articles
    .map((article, index) => {
      const titulo = article.title || article.key;
      return [
        `[${index + 1}] ${titulo}`,
        `Chave: ${article.key}${article.year ? ` · Ano: ${article.year}` : ''}`,
        `Situação: ${describeSituacao(article)}`,
        '',
        article.abstract.trim() || '(sem abstract cadastrado)',
        '',
        '-'.repeat(72),
        '',
      ].join('\n');
    })
    .join('');

  const blob = new Blob([cabecalho + corpo], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(group.title)}-abstracts-nao-usados.txt`;
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
