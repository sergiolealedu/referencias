export interface ArticleIdentity {
  groupId: number;
  key: string;
  fields: Record<string, string>;
}

export interface CanonicalRef {
  groupId: number;
  key: string;
}

export function normalizeDoi(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    .replace(/^doi:/, '')
    .trim();
}

export function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compareCanonical(a: CanonicalRef, b: CanonicalRef): number {
  if (a.groupId !== b.groupId) return a.groupId - b.groupId;
  return a.key.localeCompare(b.key, 'pt-BR', { sensitivity: 'base' });
}

class UnionFind {
  private parent = new Map<string, string>();

  private root(id: string): string {
    let current = id;
    while (this.parent.get(current) !== current) {
      current = this.parent.get(current)!;
    }
    let node = id;
    while (this.parent.get(node) !== node) {
      const next = this.parent.get(node)!;
      this.parent.set(node, current);
      node = next;
    }
    return current;
  }

  add(id: string): void {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
    }
  }

  union(a: string, b: string): void {
    this.add(a);
    this.add(b);
    const rootA = this.root(a);
    const rootB = this.root(b);
    if (rootA !== rootB) {
      this.parent.set(rootB, rootA);
    }
  }

  groups(): Map<string, string[]> {
    const clusters = new Map<string, string[]>();
    for (const id of this.parent.keys()) {
      const root = this.root(id);
      const list = clusters.get(root) ?? [];
      list.push(id);
      clusters.set(root, list);
    }
    return clusters;
  }
}

function articleId(groupId: number, key: string): string {
  return `${groupId}:${key}`;
}

function parseArticleId(id: string): CanonicalRef {
  const separator = id.indexOf(':');
  return {
    groupId: Number(id.slice(0, separator)),
    key: id.slice(separator + 1),
  };
}

export function buildDuplicateMap(articles: ArticleIdentity[]): Map<string, CanonicalRef> {
  const byId = new Map<string, ArticleIdentity>();
  for (const article of articles) {
    byId.set(articleId(article.groupId, article.key), article);
  }

  const keyOccurrences = new Map<string, string[]>();
  for (const article of articles) {
    const normalizedKey = article.key.trim().toLowerCase();
    if (!normalizedKey) continue;
    const list = keyOccurrences.get(normalizedKey) ?? [];
    list.push(articleId(article.groupId, article.key));
    keyOccurrences.set(normalizedKey, list);
  }

  const identityToArticles = new Map<string, string[]>();

  const addIdentity = (identity: string, id: string) => {
    const list = identityToArticles.get(identity) ?? [];
    list.push(id);
    identityToArticles.set(identity, list);
  };

  for (const article of articles) {
    const id = articleId(article.groupId, article.key);
    const doi = normalizeDoi(article.fields.doi ?? '');
    if (doi) addIdentity(`doi:${doi}`, id);

    const title = normalizeTitle(article.fields.title ?? '');
    const year = (article.fields.year ?? '').trim();
    if (title.length >= 10 && year) {
      addIdentity(`title:${title}|${year}`, id);
    } else if (title.length >= 25) {
      addIdentity(`title:${title}`, id);
    }

    const normalizedKey = article.key.trim().toLowerCase();
    const occurrences = keyOccurrences.get(normalizedKey);
    if (normalizedKey && occurrences && occurrences.length > 1) {
      addIdentity(`bibkey:${normalizedKey}`, id);
    }
  }

  const uf = new UnionFind();
  for (const ids of identityToArticles.values()) {
    if (ids.length < 2) continue;
    const [first, ...rest] = ids;
    for (const other of rest) {
      uf.union(first, other);
    }
  }

  const duplicateOf = new Map<string, CanonicalRef>();

  for (const members of uf.groups().values()) {
    if (members.length < 2) continue;

    const refs = members.map(parseArticleId).sort(compareCanonical);
    const canonical = refs[0];
    for (const member of refs.slice(1)) {
      duplicateOf.set(articleId(member.groupId, member.key), canonical);
    }
  }

  return duplicateOf;
}
