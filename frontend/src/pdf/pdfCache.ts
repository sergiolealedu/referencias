import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

import { getAuthToken } from '../utils/device';
import { getApiBase } from '../platform/serverUrl';

const PDF_CACHE_DIR = 'pdf-cache';

function cacheKey(filePath: string): string {
  return btoa(unescape(encodeURIComponent(filePath)))
    .replace(/[/+=]/g, (c) => ({ '/': '_', '+': '-', '=': '' })[c] ?? c);
}

export async function getCachedPdfUri(filePath: string): Promise<string | null> {
  const key = cacheKey(filePath);
  try {
    const stat = await Filesystem.stat({
      path: `${PDF_CACHE_DIR}/${key}.pdf`,
      directory: Directory.Data,
    });
    if (stat.uri) return Capacitor.convertFileSrc(stat.uri);
  } catch {
    // não em cache
  }
  return null;
}

export async function downloadAndCachePdf(filePath: string): Promise<string> {
  const cached = await getCachedPdfUri(filePath);
  if (cached) return cached;

  const apiBase = await getApiBase();
  const authToken = await getAuthToken();
  const url = `${apiBase}/files/pdf?path=${encodeURIComponent(filePath.trim())}`;

  const response = await fetch(url, {
    headers: authToken ? { 'X-Auth-Token': authToken } : {},
  });
  if (!response.ok) {
    throw new Error(`Falha ao baixar PDF: ${response.status}`);
  }

  const blob = await response.blob();
  const base64 = await blobToBase64(blob);
  const key = cacheKey(filePath);

  await Filesystem.mkdir({
    path: PDF_CACHE_DIR,
    directory: Directory.Data,
    recursive: true,
  });

  const written = await Filesystem.writeFile({
    path: `${PDF_CACHE_DIR}/${key}.pdf`,
    data: base64,
    directory: Directory.Data,
  });

  return Capacitor.convertFileSrc(written.uri);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] ?? '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function openPdf(filePath: string): Promise<string> {
  const uri = await downloadAndCachePdf(filePath);
  window.open(uri, '_blank');
  return uri;
}
