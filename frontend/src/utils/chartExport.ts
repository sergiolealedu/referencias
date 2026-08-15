import { CHART_COLOR_ORDER } from './chartColors';

const PNG_SCALE = 2;
const SVG_NS = 'http://www.w3.org/2000/svg';

function getChartSvg(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('.recharts-wrapper svg');
  if (!(svg instanceof SVGSVGElement)) {
    throw new Error('Gráfico ainda não está pronto para exportação.');
  }
  return svg;
}

async function svgElementToPngBlob(
  svgElement: SVGSVGElement,
  width: number,
  height: number,
): Promise<Blob> {
  const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
  clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clonedSvg.setAttribute('width', String(width));
  clonedSvg.setAttribute('height', String(height));

  const svgMarkup = new XMLSerializer().serializeToString(clonedSvg);
  const svgUrl = URL.createObjectURL(
    new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }),
  );

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Não foi possível renderizar o gráfico como imagem.'));
      img.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * PNG_SCALE));
    canvas.height = Math.max(1, Math.round(height * PNG_SCALE));

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Não foi possível preparar a imagem do gráfico.');
    }

    context.scale(PNG_SCALE, PNG_SCALE);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Não foi possível gerar o PNG do gráfico.'));
        },
        'image/png',
      );
    });

    return pngBlob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function copyChartPngToClipboard(container: HTMLElement): Promise<void> {
  if (!navigator.clipboard?.write) {
    throw new Error('Seu navegador não suporta copiar imagens para a área de transferência.');
  }

  const svgElement = getChartSvg(container);
  const { width, height } = svgElement.getBoundingClientRect();

  if (width <= 0 || height <= 0) {
    throw new Error('O gráfico não possui dimensões válidas para exportação.');
  }

  const pngBlob = await svgElementToPngBlob(svgElement, width, height);

  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': pngBlob }),
  ]);
}

interface HatchStyle {
  kind: 'lines' | 'cross' | 'dots';
  angle?: number;
  size: number;
  thickness: number;
  dotRadius?: number;
}

// Cinza médio em vez de preto puro: mantém as barras legíveis sem "pesar" a
// imagem quando o padrão se repete numa área grande.
const HATCH_STROKE = '#4a4a4a';

// Um estilo de achurado por cor conhecida da paleta, na mesma ordem — mantém a
// associação cor → padrão estável entre exportações, independente de quais
// segmentos estejam visíveis em cada gráfico.
// Traços finos e bem espaçados: a distinção vem da direção/forma do padrão,
// não da densidade de tinta.
const HATCH_STYLES: HatchStyle[] = [
  { kind: 'lines', angle: 45, size: 9, thickness: 0.7 },
  { kind: 'lines', angle: -45, size: 9, thickness: 0.7 },
  { kind: 'lines', angle: 0, size: 8, thickness: 0.7 },
  { kind: 'lines', angle: 90, size: 8, thickness: 0.7 },
  { kind: 'cross', size: 11, thickness: 0.6 },
  { kind: 'dots', size: 9, thickness: 0, dotRadius: 0.9 },
  { kind: 'lines', angle: 45, size: 5, thickness: 0.6 },
  { kind: 'lines', angle: -45, size: 5, thickness: 0.6 },
  { kind: 'lines', angle: 0, size: 5, thickness: 0.6 },
];

function hatchPatternMarkup(id: string, style: HatchStyle): string {
  const { size } = style;
  const background = `<rect width="${size}" height="${size}" fill="#ffffff"/>`;

  if (style.kind === 'dots') {
    const r = style.dotRadius ?? 1.2;
    return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${background}<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${HATCH_STROKE}"/></pattern>`;
  }

  if (style.kind === 'cross') {
    return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">${background}<line x1="0" y1="${size / 2}" x2="${size}" y2="${size / 2}" stroke="${HATCH_STROKE}" stroke-width="${style.thickness}"/><line x1="${size / 2}" y1="0" x2="${size / 2}" y2="${size}" stroke="${HATCH_STROKE}" stroke-width="${style.thickness}"/></pattern>`;
  }

  return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse" patternTransform="rotate(${style.angle ?? 0})">${background}<line x1="0" y1="0" x2="0" y2="${size}" stroke="${HATCH_STROKE}" stroke-width="${style.thickness}"/></pattern>`;
}

function appendPatternDef(defs: SVGDefsElement, id: string, style: HatchStyle): void {
  if (defs.querySelector(`#${id}`)) return;
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="${SVG_NS}">${hatchPatternMarkup(id, style)}</svg>`,
    'image/svg+xml',
  );
  const patternNode = doc.documentElement.firstElementChild;
  if (patternNode) {
    defs.appendChild(document.adoptNode(patternNode));
  }
}

const LABEL_BG_PADDING_X = 2;
const LABEL_BG_PADDING_Y = 1;

/**
 * Insere um retângulo branco atrás de cada texto para que os números não se
 * misturem com o achurado das barras. Precisa medir via `getBBox()`, que só
 * funciona com o SVG anexado ao documento — daí o container fora da tela.
 */
function addLabelBackgrounds(svg: SVGSVGElement): void {
  const holder = document.createElement('div');
  holder.style.cssText =
    'position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden';
  holder.appendChild(svg);
  document.body.appendChild(holder);

  try {
    svg.querySelectorAll('text').forEach((text) => {
      let box: DOMRect;
      try {
        box = text.getBBox();
      } catch {
        return;
      }
      if (!box.width || !box.height) return;

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(box.x - LABEL_BG_PADDING_X));
      rect.setAttribute('y', String(box.y - LABEL_BG_PADDING_Y));
      rect.setAttribute('width', String(box.width + LABEL_BG_PADDING_X * 2));
      rect.setAttribute('height', String(box.height + LABEL_BG_PADDING_Y * 2));
      rect.setAttribute('fill', '#ffffff');

      // O texto pode ter transform próprio (rótulos de eixo rotacionados);
      // o fundo precisa acompanhar para ficar alinhado.
      const transform = text.getAttribute('transform');
      if (transform) rect.setAttribute('transform', transform);

      text.parentNode?.insertBefore(rect, text);
    });
  } finally {
    document.body.removeChild(holder);
  }
}

/** Clona o SVG do gráfico substituindo cada cor sólida de barra por um padrão de achurado em P&B. */
function buildHatchedSvg(svgElement: SVGSVGElement): SVGSVGElement {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  const defs = document.createElementNS(SVG_NS, 'defs');
  clone.insertBefore(defs, clone.firstChild);

  const colorToPatternId = new Map<string, string>();
  let nextFallbackIndex = CHART_COLOR_ORDER.length;

  const filledEls = clone.querySelectorAll<SVGElement>('path[fill], rect[fill]');
  filledEls.forEach((el) => {
    const fill = el.getAttribute('fill')?.toLowerCase();
    if (!fill || !/^#[0-9a-f]{6}$/.test(fill) || fill === '#ffffff') return;

    let patternId = colorToPatternId.get(fill);
    if (!patternId) {
      const knownIndex = CHART_COLOR_ORDER.findIndex((c) => c.toLowerCase() === fill);
      const styleIndex = knownIndex >= 0 ? knownIndex : nextFallbackIndex++;
      const style = HATCH_STYLES[styleIndex % HATCH_STYLES.length];
      patternId = `chart-hatch-${styleIndex % HATCH_STYLES.length}`;
      appendPatternDef(defs, patternId, style);
      colorToPatternId.set(fill, patternId);
    }
    el.setAttribute('fill', `url(#${patternId})`);
    // Contorno fino mantém os segmentos delimitados agora que o preenchimento
    // é claro.
    if (!el.getAttribute('stroke')) {
      el.setAttribute('stroke', HATCH_STROKE);
      el.setAttribute('stroke-width', '0.6');
    }
  });

  addLabelBackgrounds(clone);

  return clone;
}

export async function copyChartPatternPngToClipboard(container: HTMLElement): Promise<void> {
  if (!navigator.clipboard?.write) {
    throw new Error('Seu navegador não suporta copiar imagens para a área de transferência.');
  }

  const svgElement = getChartSvg(container);
  const { width, height } = svgElement.getBoundingClientRect();

  if (width <= 0 || height <= 0) {
    throw new Error('O gráfico não possui dimensões válidas para exportação.');
  }

  const hatchedSvg = buildHatchedSvg(svgElement);
  const pngBlob = await svgElementToPngBlob(hatchedSvg, width, height);

  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': pngBlob }),
  ]);
}
