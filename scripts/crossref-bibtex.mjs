#!/usr/bin/env node
/**
 * Títulos colados → BibTeX, via Crossref.
 *
 * Existe porque o export do Scopus pelo proxy do CAPES pode simplesmente não
 * entregar arquivo — nem BibTeX, nem RIS, nem CSV. Copiar texto da tela, por
 * outro lado, sempre funciona: não passa por download, nem por POST de export,
 * nem pela sessão do EZproxy. Este script fecha a lacuna entre as duas coisas.
 *
 * O casamento é por título e PODE ERRAR: títulos parecidos existem, e o
 * Crossref não indexa tudo o que o Scopus indexa (anais antigos, sobretudo).
 * Por isso a saída vem em dois arquivos — o .bib com o que passou do corte, e
 * um relatório com score de cada linha, para conferência humana. Nada aqui
 * substitui olhar o relatório antes de importar.
 *
 * Uso:
 *   node scripts/crossref-bibtex.mjs titulos.txt
 *   node scripts/crossref-bibtex.mjs titulos.txt --out corpus.bib --report casamento.md
 *   cat titulos.txt | node scripts/crossref-bibtex.mjs -
 *
 * Opções:
 *   --out <arquivo>      .bib de saída (padrão: <entrada>.bib)
 *   --report <arquivo>    relatório de casamento (padrão: <entrada>.casamento.md)
 *   --min-score <0..1>    corte para entrar no .bib (padrão: 0.80)
 *   --all                 põe tudo no .bib, inclusive score baixo (marcado no relatório)
 *   --mailto <email>      entra no "polite pool" do Crossref; sem isso usa o pool público
 *   --delay <ms>          espera entre consultas (padrão: 120)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const CROSSREF = 'https://api.crossref.org/works';

// ---------------------------------------------------------------- argumentos

function parseArgs(argv) {
  const opts = {
    input: null,
    out: null,
    report: null,
    minScore: 0.8,
    all: false,
    mailto: null,
    delay: 120,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const proximo = () => {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(`A opção ${arg} precisa de um valor.`);
      }
      i += 1;
      return value;
    };
    if (arg === '--out') opts.out = proximo();
    else if (arg === '--report') opts.report = proximo();
    else if (arg === '--min-score') opts.minScore = Number(proximo());
    else if (arg === '--all') opts.all = true;
    else if (arg === '--mailto') opts.mailto = proximo();
    else if (arg === '--delay') opts.delay = Number(proximo());
    else if (arg.startsWith('--')) throw new Error(`Opção desconhecida: ${arg}`);
    else rest.push(arg);
  }
  opts.input = rest[0] ?? null;
  if (!Number.isFinite(opts.minScore) || opts.minScore < 0 || opts.minScore > 1) {
    throw new Error('--min-score precisa ser um número entre 0 e 1.');
  }
  if (!Number.isFinite(opts.delay) || opts.delay < 0) {
    throw new Error('--delay precisa ser um número de milissegundos.');
  }
  return opts;
}

// -------------------------------------------------------------------- leitura

function lerStdin() {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    throw new Error('Nada chegou pela entrada padrão.');
  }
}

/** Um DOI em qualquer lugar da linha vence o título: casamento exato, sem score. */
const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;

/**
 * Copiar da tela do Scopus traz sujeira previsível junto do título: numeração
 * da lista, contador de citações, o rótulo do link do PDF. Tudo isso some aqui.
 * O que NÃO tento adivinhar é linha de autor ou de veículo — quem cola decide o
 * que é uma linha, e uma linha é um registro.
 */
function limparLinha(linha) {
  let t = linha.trim();
  t = t.replace(/^\d+[.)]\s+/, '');
  t = t.replace(/\s*\|\s*Cited by\s+\d+.*$/i, '');
  t = t.replace(/\s*(Full Text|View at Publisher|Ver no editor|PDF)\s*$/i, '');
  t = t.replace(/\s+/g, ' ');
  return t.trim();
}

function lerRegistros(texto) {
  const vistos = new Set();
  const registros = [];
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = limparLinha(bruta);
    if (!linha) continue;
    // Linha curtíssima quase nunca é título; costuma ser resto de cabeçalho.
    if (linha.length < 12 && !DOI_RE.test(linha)) continue;
    const doi = linha.match(DOI_RE)?.[0]?.replace(/[.,;]+$/, '') ?? null;
    const chaveDedupe = (doi ?? linha).toLowerCase();
    if (vistos.has(chaveDedupe)) continue;
    vistos.add(chaveDedupe);
    registros.push({ entrada: linha, doi });
  }
  return registros;
}

// ------------------------------------------------------------ similaridade

function normalizar(texto) {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigramas(texto) {
  const mapa = new Map();
  for (let i = 0; i < texto.length - 1; i += 1) {
    const g = texto.slice(i, i + 2);
    mapa.set(g, (mapa.get(g) ?? 0) + 1);
  }
  return mapa;
}

/**
 * Dice sobre bigramas de caractere. Escolhido por ser tolerante a diferença de
 * pontuação e de subtítulo — que é justamente como título de artigo varia entre
 * o que o Scopus mostra e o que o Crossref registra — sem dar match em título
 * só porque compartilha palavras comuns.
 */
function similaridade(a, b) {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ga = bigramas(na);
  const gb = bigramas(nb);
  let comuns = 0;
  let totalA = 0;
  let totalB = 0;
  for (const n of ga.values()) totalA += n;
  for (const n of gb.values()) totalB += n;
  for (const [g, n] of ga) {
    const m = gb.get(g);
    if (m) comuns += Math.min(n, m);
  }
  return (2 * comuns) / (totalA + totalB);
}

// ------------------------------------------------------------------ Crossref

function headers(mailto) {
  const contato = mailto ? ` (mailto:${mailto})` : '';
  return { 'User-Agent': `referencias-app/1.0${contato}`, Accept: 'application/json' };
}

async function buscar(url, mailto, tentativa = 0) {
  const resposta = await fetch(url, { headers: headers(mailto) });
  if (resposta.status === 429 || resposta.status >= 500) {
    if (tentativa >= 3) {
      throw new Error(`Crossref respondeu ${resposta.status} depois de 4 tentativas.`);
    }
    // Backoff: o 429 do Crossref é por rajada, então esperar resolve.
    await new Promise((r) => setTimeout(r, 1000 * 2 ** tentativa));
    return buscar(url, mailto, tentativa + 1);
  }
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw new Error(`Crossref respondeu ${resposta.status}.`);
  return resposta.json();
}

async function porDoi(doi, mailto) {
  const json = await buscar(`${CROSSREF}/${encodeURIComponent(doi)}`, mailto);
  return json?.message ?? null;
}

async function porTitulo(titulo, mailto) {
  const url = new URL(CROSSREF);
  url.searchParams.set('query.bibliographic', titulo);
  url.searchParams.set('rows', '5');
  const json = await buscar(url.toString(), mailto);
  const itens = json?.message?.items ?? [];
  let melhor = null;
  for (const item of itens) {
    const tituloItem = item.title?.[0];
    if (!tituloItem) continue;
    const score = similaridade(titulo, tituloItem);
    if (!melhor || score > melhor.score) melhor = { item, score };
  }
  return melhor;
}

// -------------------------------------------------------------------- BibTeX

const TIPO_BIBTEX = {
  'journal-article': 'article',
  'proceedings-article': 'inproceedings',
  'book-chapter': 'incollection',
  'book': 'book',
  'monograph': 'book',
  'report': 'techreport',
  'dissertation': 'phdthesis',
  'posted-content': 'misc',
};

function escapar(valor) {
  return String(valor).replace(/\\/g, '\\\\').replace(/}/g, '\\}');
}

function anoDe(item) {
  const partes =
    item.issued?.['date-parts']?.[0] ??
    item['published-print']?.['date-parts']?.[0] ??
    item['published-online']?.['date-parts']?.[0];
  const ano = partes?.[0];
  return ano ? String(ano) : '';
}

function autoresDe(item) {
  const autores = item.author ?? [];
  return autores
    .map((a) => {
      const family = (a.family ?? '').trim();
      const given = (a.given ?? '').trim();
      if (family && given) return `${family}, ${given}`;
      return family || given || (a.name ?? '').trim();
    })
    .filter(Boolean)
    .join(' and ');
}

/**
 * Chave no estilo que o corpus já usa: sobrenome do primeiro autor + ano
 * (Wong2023, Akdur2024). Colisão ganha sufixo de letra — nunca sobrescreve.
 */
function chaveDe(item, usadas) {
  const family = (item.author?.[0]?.family ?? item.author?.[0]?.name ?? 'SemAutor')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z]/g, '');
  const base = `${family || 'SemAutor'}${anoDe(item) || 's.d.'}`;
  if (!usadas.has(base)) {
    usadas.add(base);
    return base;
  }
  for (let i = 0; ; i += 1) {
    const tentativa = `${base}${String.fromCharCode(97 + (i % 26))}`;
    if (!usadas.has(tentativa)) {
      usadas.add(tentativa);
      return tentativa;
    }
  }
}

function paraBibtex(item, chave) {
  const tipo = TIPO_BIBTEX[item.type] ?? 'misc';
  const veiculo = item['container-title']?.[0] ?? '';
  const campos = [];
  const por = (nome, valor) => {
    const v = (valor ?? '').toString().trim();
    if (v) campos.push(`  ${nome} = {${escapar(v)}},`);
  };

  por('title', item.title?.[0]);
  por('author', autoresDe(item));
  if (tipo === 'inproceedings' || tipo === 'incollection') por('booktitle', veiculo);
  else por('journal', veiculo);
  por('year', anoDe(item));
  por('volume', item.volume);
  por('number', item.issue);
  por('pages', item.page);
  por('publisher', item.publisher);
  por('doi', item.DOI);

  return [`@${tipo}{${chave},`, ...campos, '}'].join('\n');
}

// ----------------------------------------------------------------------- main

function veredito(score, viaDoi) {
  if (viaDoi) return 'DOI';
  if (score >= 0.95) return 'alta';
  if (score >= 0.8) return 'media';
  return 'baixa';
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.input) {
    console.error('Uso: node scripts/crossref-bibtex.mjs <titulos.txt|-> [opções]');
    console.error('     (veja o cabeçalho do arquivo para as opções)');
    process.exit(1);
  }

  const texto = opts.input === '-' ? lerStdin() : readFileSync(opts.input, 'utf-8');
  const registros = lerRegistros(texto);
  if (registros.length === 0) {
    console.error('Nenhuma linha aproveitável na entrada.');
    process.exit(1);
  }

  const nomeBase = opts.input === '-' ? 'titulos' : basename(opts.input).replace(/\.[^.]+$/, '');
  const arquivoBib = opts.out ?? `${nomeBase}.bib`;
  const arquivoRelatorio = opts.report ?? `${nomeBase}.casamento.md`;

  console.error(`${registros.length} registro(s) para casar no Crossref.`);

  const resultados = [];
  const usadas = new Set();

  for (const [i, registro] of registros.entries()) {
    process.stderr.write(`\r  ${i + 1}/${registros.length}...`);
    try {
      let item = null;
      let score = 0;
      let viaDoi = false;

      if (registro.doi) {
        item = await porDoi(registro.doi, opts.mailto);
        viaDoi = item !== null;
      }
      if (!item) {
        const melhor = await porTitulo(registro.entrada, opts.mailto);
        item = melhor?.item ?? null;
        score = melhor?.score ?? 0;
      }

      resultados.push({
        entrada: registro.entrada,
        item,
        score,
        viaDoi,
        veredito: item ? veredito(score, viaDoi) : 'sem-resultado',
        erro: null,
      });
    } catch (erro) {
      resultados.push({
        entrada: registro.entrada,
        item: null,
        score: 0,
        viaDoi: false,
        veredito: 'erro',
        erro: erro.message,
      });
    }
    if (opts.delay > 0) await new Promise((r) => setTimeout(r, opts.delay));
  }
  process.stderr.write('\r');

  const entradas = [];
  const linhasRelatorio = [
    '# Casamento de títulos no Crossref',
    '',
    'Confira as linhas `media` e `baixa` antes de importar: o casamento é por',
    'similaridade de título, e títulos parecidos existem.',
    '',
    '| # | Veredito | Score | Entrada | Casou com | DOI |',
    '|---|---|---|---|---|---|',
  ];

  const escaparTabela = (v) => String(v ?? '').replace(/\|/g, '\\|');

  for (const [i, r] of resultados.entries()) {
    const entrou = r.item && (opts.all || r.viaDoi || r.score >= opts.minScore);
    if (entrou) {
      entradas.push(paraBibtex(r.item, chaveDe(r.item, usadas)));
    }
    const marca = entrou ? r.veredito : `${r.veredito} (fora)`;
    linhasRelatorio.push(
      `| ${i + 1} | ${marca} | ${r.viaDoi ? '—' : r.score.toFixed(2)} | ${escaparTabela(
        r.entrada,
      )} | ${escaparTabela(r.item?.title?.[0] ?? r.erro ?? '—')} | ${escaparTabela(
        r.item?.DOI ?? '—',
      )} |`,
    );
  }

  writeFileSync(arquivoBib, `${entradas.join('\n\n')}\n`, 'utf-8');
  writeFileSync(arquivoRelatorio, `${linhasRelatorio.join('\n')}\n`, 'utf-8');

  const contagem = (v) => resultados.filter((r) => r.veredito === v).length;
  console.error(`${arquivoBib}: ${entradas.length} entrada(s).`);
  console.error(
    `  DOI ${contagem('DOI')} · alta ${contagem('alta')} · media ${contagem('media')} ` +
      `· baixa ${contagem('baixa')} · sem resultado ${contagem('sem-resultado')} ` +
      `· erro ${contagem('erro')}`,
  );
  console.error(`${arquivoRelatorio}: confira antes de importar.`);
}

main().catch((erro) => {
  console.error(`Erro: ${erro.message}`);
  process.exit(1);
});
