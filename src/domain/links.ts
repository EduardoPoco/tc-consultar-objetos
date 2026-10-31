export interface ExternalLink {
  id: string;
  name: string;
  url: string;
}

const keyFor = (projectId: string) => `tc-consultar-objetos:ligacoes:${projectId}`;

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function loadLinks(store: Pick<Storage, "getItem">, projectId: string): ExternalLink[] {
  const raw = store.getItem(keyFor(projectId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const link = entry as Partial<ExternalLink>;
      if (typeof link.id !== "string" || typeof link.name !== "string" || typeof link.url !== "string") return [];
      if (!link.name.trim() || !isHttpUrl(link.url)) return [];
      return [{ id: link.id, name: link.name.trim(), url: link.url.trim() }];
    });
  } catch {
    return [];
  }
}

export function saveLinks(store: Pick<Storage, "setItem">, projectId: string, links: ExternalLink[]): void {
  store.setItem(keyFor(projectId), JSON.stringify(links));
}

export function upsertLink(links: ExternalLink[], draft: { id: string; name: string; url: string }): ExternalLink[] {
  const next = { id: draft.id || newId(), name: draft.name.trim(), url: draft.url.trim() };
  const index = links.findIndex((link) => link.id === next.id);
  if (index < 0) return [...links, next];
  return links.map((link) => (link.id === next.id ? next : link));
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `ligacao-${Date.now()}`;
}
