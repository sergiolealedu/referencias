export interface ParsedBibEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

export interface BibtexParseError {
  key: string;
  type: string;
  reason: string;
}

export interface BibtexParseResult {
  entries: ParsedBibEntry[];
  errors: BibtexParseError[];
}

/**
 * Remove comentários de linha (`%`), respeitando `\%` literal — e, sobretudo,
 * respeitando `%` que não é comentário nenhum.
 *
 * O Scopus exporta a URL do registro com percent-encoding cru:
 * `url = {...&doi=10.1186%2fs13643-025-03028-2&...}`. Cortando a linha naquele
 * `%`, a chave aberta do valor nunca fecha, e a entrada inteira era recusada
 * como "chaves desbalanceadas". Ou seja: todo BibTeX do Scopus com `%` na URL
 * — que é a regra, não a exceção — entrava como erro.
 *
 * A profundidade de chaves separa os casos. Fora de entrada (0) e entre campos
 * de uma entrada (1), `%` é comentário de verdade e some. A partir de 2 estamos
 * dentro de um valor, e ali `%` é dado. Valor entre aspas segue a mesma regra.
 *
 * As chaves são contadas sem olhar escape, igual a `readBracedValue` e
 * `findEntryClose`: as três precisam concordar sobre onde um valor começa e
 * termina, senão o corte de comentário cai num ponto que o leitor não espera.
 */
function stripComments(text: string): string {
  let out = '';
  let depth = 0;
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const anterior = i > 0 ? text[i - 1] : '';

    if (ch === '%' && anterior !== '\\' && !inQuotes && depth < 2) {
      // Pula até o fim da linha; o `\n` fica, para não juntar duas linhas.
      while (i + 1 < text.length && text[i + 1] !== '\n') i++;
      continue;
    }

    if (ch === '"' && anterior !== '\\' && depth === 1) inQuotes = !inQuotes;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth = Math.max(0, depth - 1);

    out += ch;
  }

  return out;
}

function readBracedValue(text: string, start: number): { value: string; end: number } | null {
  if (text[start] !== '{') return null;
  let depth = 0;
  let value = '';
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      depth += 1;
      if (depth > 1) value += ch;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { value: value.trim(), end: i + 1 };
      value += ch;
    } else {
      value += ch;
    }
  }
  return null;
}

function readQuotedValue(text: string, start: number): { value: string; end: number } | null {
  if (text[start] !== '"') return null;
  let value = '';
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') return { value: value.trim(), end: i + 1 };
    value += ch;
  }
  return null;
}

function readFieldValue(text: string, start: number): { value: string; end: number } | null {
  const trimmedStart = start + (text.slice(start).match(/^\s*/)?.[0].length ?? 0);
  if (text[trimmedStart] === '{') return readBracedValue(text, trimmedStart);
  if (text[trimmedStart] === '"') return readQuotedValue(text, trimmedStart);
  const match = text.slice(trimmedStart).match(/^([^,\n}]+)/);
  if (!match) return null;
  return { value: match[1].trim(), end: trimmedStart + match[1].length };
}

function normalizeFieldValue(value: string): string {
  return value
    .replace(/\\&/g, '&')
    .replace(/\\_/g, '_')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseEntryBody(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    const nameMatch = body.slice(i).match(/^\s*([a-zA-Z][\w-]*)\s*=\s*/);
    if (!nameMatch) {
      i += 1;
      continue;
    }
    const name = nameMatch[1].toLowerCase();
    i += nameMatch[0].length;
    const valueResult = readFieldValue(body, i);
    if (!valueResult) break;
    fields[name] = normalizeFieldValue(valueResult.value);
    i = valueResult.end;
    while (i < body.length && /[\s,]/.test(body[i])) i += 1;
  }
  return fields;
}

export function parseBibtex(content: string): BibtexParseResult {
  const cleaned = stripComments(content);
  const entries: ParsedBibEntry[] = [];
  const errors: BibtexParseError[] = [];
  // A chave aceita espaço no meio. O Scopus a monta com sobrenome do primeiro
  // autor + ano, e sobrenome composto sai literal: `@ARTICLE{Pardo Calvache2025,`,
  // `{Ur Rehman2021,`, `{Abu Seman2020352,`. Exigindo chave sem espaço, o `@`
  // não casava, a entrada era pulada sem nada em `errors`, e o registro
  // desaparecia — atingindo justamente nomes hispânicos, árabes e do sul da
  // Ásia. Num levantamento sistemático isso é viés de exclusão.
  //
  // `[^,{}\n]` em vez de `[^,\s]`: sem chave e sem nova linha, para a captura
  // não atravessar o início do primeiro campo quando falta a vírgula. Preguiçoso
  // para parar na primeira vírgula, e ainda exige ao menos um caractere — então
  // `@ARTICLE{,` continua sendo entrada sem chave, reportada como antes.
  const entryRegex = /@([^\s{]+)\s*\{\s*([^,{}\n]+?)\s*,/g;
  let match: RegExpExecArray | null;

  // Trechos já consumidos, para a varredura final saber o que sobrou.
  const consumidas: Array<[number, number]> = [];

  while ((match = entryRegex.exec(cleaned)) !== null) {
    const type = match[1].toLowerCase();
    // Espaço no meio da chave é inutilizável: `\cite{Pardo Calvache2025}` não
    // compila, e a chave é a identidade usada na deduplicação. Colar as partes
    // dá `PardoCalvache2025`, no mesmo estilo do resto do corpus (`Wong2023`).
    const key = match[2].trim().replace(/\s+/g, '');
    const bodyStart = match.index + match[0].length;
    const bodyEnd = findEntryClose(cleaned, bodyStart);
    consumidas.push([match.index, bodyEnd === -1 ? bodyStart : bodyEnd]);
    if (bodyEnd === -1) {
      errors.push({
        key,
        type,
        reason:
          'Não foi possível fechar a entrada (chaves desbalanceadas). ' +
          'Causas comuns: `%` literal no texto (use \\%), chaves `{`/`}` não fechadas ou vírgula faltando entre campos.',
      });
      continue;
    }
    const fields = parseEntryBody(cleaned.slice(bodyStart, bodyEnd));
    if (Object.keys(fields).length === 0) {
      errors.push({
        key,
        type,
        reason: 'Nenhum campo reconhecido na entrada.',
      });
      continue;
    }
    entries.push({ type, key, fields });
    entryRegex.lastIndex = bodyEnd + 1;
  }

  /**
   * Cabeçalho `@tipo{` que o laço não consumiu não pode sumir calado. Era assim
   * que entrada com chave fora do formato esperado desaparecia: o `@` não casava,
   * o laço seguia adiante, e o registro não aparecia nem em `entries` nem em
   * `errors` — some sem deixar rastro no total. Num levantamento sistemático o
   * número de registros recuperados tem de fechar, então o que não entra precisa
   * ser dito.
   */
  const cabecalhoRegex = /@([A-Za-z]+)\s*\{/g;
  // `@string`, `@comment` e `@preamble` são construções válidas do BibTeX que
  // não são entradas — não há nada a reportar nelas.
  const NAO_ENTRADA = new Set(['string', 'comment', 'preamble']);
  let cabecalho: RegExpExecArray | null;
  while ((cabecalho = cabecalhoRegex.exec(cleaned)) !== null) {
    const inicio = cabecalho.index;
    const tipo = cabecalho[1].toLowerCase();
    if (NAO_ENTRADA.has(tipo)) continue;
    if (consumidas.some(([ini, fim]) => inicio >= ini && inicio <= fim)) continue;
    errors.push({
      key: '?',
      type: tipo,
      reason:
        'Cabeçalho não reconhecido — esperado `@tipo{chave,`. ' +
        'Verifique a chave de citação e a vírgula que a fecha.',
    });
  }

  if (entries.length === 0 && errors.length === 0) {
    const trimmed = cleaned.trim();
    if (trimmed.length > 0) {
      errors.push({
        key: '?',
        type: '?',
        reason: trimmed.includes('@')
          ? 'Nenhuma entrada no formato @tipo{chave, ...} foi reconhecida. Verifique a sintaxe.'
          : 'Texto não contém nenhuma entrada @tipo{chave,...}.',
      });
    }
  }

  return { entries, errors };
}

function findEntryClose(text: string, start: number): number {
  let depth = 1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}
