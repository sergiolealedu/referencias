const PNG_SCALE = 2;

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
