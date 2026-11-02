import { withTimeout } from "./hostChoice";

export interface MarkupRef {
  id?: number;
  text?: string;
}

export interface MarkupBatchResult {
  ids: number[];
  accepted: number;
}

export interface LabelMarkupApi {
  addTextMarkup(markups: Array<{ text?: string }>): Promise<MarkupRef[]>;
  getTextMarkups(): Promise<MarkupRef[]>;
  removeMarkups(ids: number[]): Promise<void>;
}

const idsOf = (markups: MarkupRef[]): number[] =>
  markups.flatMap((markup) => (typeof markup.id === "number" ? [markup.id] : []));

/** Removes markups in chunks. An empty list is never sent: `undefined` would delete every markup in the viewer. */
export async function removeMarkupBatches(api: Pick<LabelMarkupApi, "removeMarkups">, ids: number[], batchSize: number): Promise<void> {
  const unique = [...new Set(ids)].filter((id) => Number.isFinite(id));
  for (let start = 0; start < unique.length; start += batchSize) {
    const chunk = unique.slice(start, start + batchSize);
    if (chunk.length === 0) continue;
    await api.removeMarkups(chunk);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Creates one batch and returns the ids the viewer actually assigned.
 * The list of existing markups is read only after the create call, and only
 * when the response omitted ids. A hung getTextMarkups must not block the create.
 */
export async function addMarkupBatch<T extends { text: string }, M extends { text?: string }>(
  api: {
    addTextMarkup(markups: M[]): Promise<MarkupRef[]>;
    getTextMarkups(): Promise<MarkupRef[]>;
  },
  chunk: T[],
  toMarkup: (item: T) => M,
  lookupMs = 4000,
  occupied: Iterable<number> = [],
): Promise<MarkupBatchResult> {
  if (chunk.length === 0) return { ids: [], accepted: 0 };
  const created = await api.addTextMarkup(chunk.map(toMarkup));
  const list = Array.isArray(created) ? created : [];
  const fromResponse = idsOf(list);
  if (fromResponse.length >= chunk.length || list.length === 0) {
    return { ids: fromResponse.slice(0, chunk.length), accepted: list.length };
  }

  let after: MarkupRef[] = [];
  try {
    after = await withTimeout(api.getTextMarkups(), lookupMs);
  } catch {
    return { ids: fromResponse, accepted: list.length };
  }
  const known = new Set<number>([...fromResponse, ...occupied]);
  const needed = new Map<string, number>();
  for (const item of chunk) needed.set(item.text, (needed.get(item.text) ?? 0) + 1);
  for (const markup of list) {
    if (typeof markup.id !== "number" || typeof markup.text !== "string") continue;
    const left = needed.get(markup.text) ?? 0;
    if (left > 0) needed.set(markup.text, left - 1);
  }
  const extra: number[] = [];
  const ranked = [...after].sort((left, right) => (right.id ?? 0) - (left.id ?? 0));
  for (const markup of ranked) {
    if (typeof markup.id !== "number" || known.has(markup.id)) continue;
    const text = markup.text ?? "";
    const left = needed.get(text) ?? 0;
    if (left <= 0) continue;
    needed.set(text, left - 1);
    known.add(markup.id);
    extra.push(markup.id);
    if (fromResponse.length + extra.length >= chunk.length) break;
  }
  return { ids: [...fromResponse, ...extra].sort((left, right) => left - right), accepted: list.length };
}

const EMPTY_MARKUPS = "O visualizador não criou etiquetas (addTextMarkup devolveu uma lista vazia).";

/**
 * Sends the documented TextMarkup (positionX/Y/Z in mm, text, color) first.
 * If that call rejects or returns nothing, repeats the same chunk bound to the
 * object runtime id. A rejection is returned to the caller; it is not ignored.
 */
export async function placeTextMarkups<T extends { text: string }, M extends { text?: string }>(
  api: {
    addTextMarkup(markups: M[]): Promise<MarkupRef[]>;
    getTextMarkups(): Promise<MarkupRef[]>;
  },
  chunk: T[],
  toWorld: (item: T) => M,
  toBound: (item: T) => M,
  occupied: Iterable<number> = [],
): Promise<MarkupBatchResult> {
  if (chunk.length === 0) return { ids: [], accepted: 0 };
  const failures: string[] = [];
  for (const toMarkup of [toWorld, toBound]) {
    try {
      const result = await addMarkupBatch(api, chunk, toMarkup, 4000, occupied);
      if (result.accepted > 0) return result;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "addTextMarkup falhou.");
    }
  }
  const detail = failures.filter(Boolean).join(" ");
  throw new Error(detail ? `${detail} ${EMPTY_MARKUPS}` : EMPTY_MARKUPS);
}
