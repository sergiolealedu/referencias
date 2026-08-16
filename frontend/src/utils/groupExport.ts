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
 * JSON auto-explicativo: carrega as instruções da avaliação junto com os dados,
 * então basta entregar o arquivo a uma IA. A resposta esperada é o mesmo
 * formato aceito por `parseRevisaoResposta`.
 */
export function downloadAbstractsNaoUsados(payload: AbstractsExport): void {
  const { group, articles } = payload;
  const semAbstract = articles.filter((a) => !a.abstract.trim()).length;

  const arquivo = {
    instrucoes: [
      'Avalie cada item de "artigos" e identifique os que foram descartados por engano.',
      'Critério: o artigo trata de qualidade de vida no trabalho (QVT), bem-estar,',
      'satisfação, burnout ou saúde ocupacional de desenvolvedores de software',
      '(ou de profissionais de engenharia de software).',
      'Um artigo sem abstract não pode ser avaliado: liste a chave dele em "semAbstract".',
      'Responda APENAS com um JSON no formato indicado em "formatoResposta",',
      'usando exatamente as chaves recebidas em "chave".',
    ].join(' '),
    formatoResposta: {
      usar: ['<chave do artigo que deve voltar a ser usado>'],
      semAbstract: ['<chave de artigo sem abstract, que precisa de leitura manual>'],
      justificativas: { '<chave>': '<por que este artigo se encaixa no critério>' },
    },
    grupo: { id: group.id, titulo: group.title, versao: group.versao },
    resumo: {
      totalNaoUsados: articles.length,
      semAbstractCadastrado: semAbstract,
    },
    artigos: articles.map((article) => ({
      chave: article.key,
      titulo: article.title || article.key,
      ano: article.year,
      situacao: describeSituacao(article),
      abstract: article.abstract.trim(),
    })),
  };

  const blob = new Blob([JSON.stringify(arquivo, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(group.title)}-abstracts-nao-usados.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Aceita a resposta da IA em JSON (objeto com `usar`, ou array puro) ou como
 * lista simples de chaves — uma por linha. Modelos variam no formato, e exigir
 * um só formato faria o usuário editar o retorno à mão.
 */
export function parseRevisaoResposta(text: string): string[] {
  const conteudo = text.trim();
  if (!conteudo) return [];

  // Tolera cercas de código (```json ... ```) em volta da resposta.
  const semCerca = conteudo
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  try {
    const data = JSON.parse(semCerca) as unknown;
    if (Array.isArray(data)) {
      return data.filter((item): item is string => typeof item === 'string');
    }
    if (data && typeof data === 'object' && 'usar' in data) {
      const usar = (data as { usar?: unknown }).usar;
      if (Array.isArray(usar)) {
        return usar.filter((item): item is string => typeof item === 'string');
      }
    }
    throw new Error(
      'JSON sem a lista "usar". Esperado {"usar": ["chave1", "chave2"]} ou uma lista de chaves.',
    );
  } catch (error) {
    if (semCerca.startsWith('{') || semCerca.startsWith('[')) {
      throw error instanceof SyntaxError
        ? new Error('JSON inválido — verifique se a resposta foi copiada por inteiro.')
        : (error as Error);
    }
  }

  // Sem JSON: trata como lista de chaves, ignorando marcadores de lista.
  return semCerca
    .split(/[\r\n,;]+/)
    .map((linha) => linha.replace(/^[-*\d.)\s"']+/, '').replace(/["']+$/, '').trim())
    .filter(Boolean);
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
