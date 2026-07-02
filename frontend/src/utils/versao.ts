export function compareVersao(a: string, b: string): number {
  const parse = (value: string) => {
    const match = value.match(/^v?(\d+)$/i);
    return match ? Number(match[1]) : Number.NaN;
  };
  const numA = parse(a);
  const numB = parse(b);
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
}

export function getLatestVersao(versoes: string[]): string {
  if (versoes.length === 0) return '';
  return [...versoes].sort(compareVersao).at(-1)!;
}

export function collectVersoes(
  items: Array<{ versao: string }>,
): string[] {
  const versoes = new Set(items.map((item) => item.versao).filter(Boolean));
  return [...versoes].sort(compareVersao);
}
