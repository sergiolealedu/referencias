/** Une opções conhecidas com o valor atual e extras, em ordem alfabética. */
export function mergeOptions(
  options: readonly string[],
  current: string,
  extra?: readonly string[],
): string[] {
  const set = new Set<string>();
  for (const option of options) {
    if (option) set.add(option);
  }
  for (const option of extra ?? []) {
    if (option) set.add(option);
  }
  if (current.trim()) set.add(current.trim());
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}
