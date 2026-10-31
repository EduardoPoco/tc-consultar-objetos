export interface MarkupRef {
  id?: number;
  text?: string;
}

export interface LabelMarkupApi {
  addTextMarkup(markups: Array<{ text?: string }>): Promise<MarkupRef[]>;
  getTextMarkups(): Promise<MarkupRef[]>;
  removeMarkups(ids: number[]): Promise<void>;
}

const idsOf = (markups: MarkupRef[]): number[] =>
  markups.flatMap((markup) => (typeof markup.id === "number" ? [markup.id] : []));

/** Removes markups in chunks so a large clear does not freeze the viewer. */
export async function removeMarkupBatches(api: Pick<LabelMarkupApi, "removeMarkups">, ids: number[], batchSize: number): Promise<void> {
  const unique = [...new Set(ids)];
  for (let start = 0; start < unique.length; start += batchSize) {
    const chunk = unique.slice(start, start + batchSize);
    if (chunk.length === 0) continue;
    await api.removeMarkups(chunk);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Creates one batch of text markups and returns every new id.
 * When the viewer omits ids, the new markups are taken from getTextMarkups
 * by comparing the ids that existed before the call and matching the text.
 */
export async function addMarkupBatch<T extends { text: string }, M extends { text?: string }>(
  api: {
    addTextMarkup(markups: M[]): Promise<MarkupRef[]>;
    getTextMarkups(): Promise<MarkupRef[]>;
  },
  chunk: T[],
  toMarkup: (item: T) => M,
): Promise<number[]> {
  if (chunk.length === 0) return [];
  let before: Set<number> | null = null;
  try {
    before = new Set(idsOf(await api.getTextMarkups()));
  } catch {
    before = null;
  }
  const created = await api.addTextMarkup(chunk.map(toMarkup));
  const fromResponse = idsOf(created);
  if (fromResponse.length >= chunk.length || before === null) return fromResponse.slice(0, chunk.length);

  let after: MarkupRef[] = [];
  try {
    after = await api.getTextMarkups();
  } catch {
    return fromResponse;
  }
  const needed = new Map<string, number>();
  for (const item of chunk) needed.set(item.text, (needed.get(item.text) ?? 0) + 1);
  for (const markup of created) {
    if (typeof markup.id !== "number" || typeof markup.text !== "string") continue;
    const left = needed.get(markup.text) ?? 0;
    if (left > 0) needed.set(markup.text, left - 1);
  }
  const extra: number[] = [];
  for (const markup of after) {
    if (typeof markup.id !== "number" || before.has(markup.id) || fromResponse.includes(markup.id)) continue;
    const text = markup.text ?? "";
    const left = needed.get(text) ?? 0;
    if (left <= 0) continue;
    needed.set(text, left - 1);
    extra.push(markup.id);
    if (fromResponse.length + extra.length >= chunk.length) break;
  }
  return [...fromResponse, ...extra];
}
