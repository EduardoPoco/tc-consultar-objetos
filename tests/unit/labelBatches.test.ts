import { describe, expect, it } from "vitest";
import { addMarkupBatch, removeMarkupBatches, type MarkupRef } from "../../src/host/labelBatches";

interface FakeMarkupApi {
  added: string[][];
  removed: number[][];
  nextId: number;
  existing: MarkupRef[];
  omitIds: boolean;
  addTextMarkup(markups: Array<{ text?: string }>): Promise<MarkupRef[]>;
  getTextMarkups(): Promise<MarkupRef[]>;
  removeMarkups(ids: number[]): Promise<void>;
}

function fakeApi(options: { omitIds?: boolean; existing?: MarkupRef[] } = {}): FakeMarkupApi {
  const api: FakeMarkupApi = {
    added: [],
    removed: [],
    nextId: 10,
    existing: options.existing ? options.existing.map((markup) => ({ ...markup })) : [],
    omitIds: options.omitIds ?? false,
    async addTextMarkup(markups) {
      api.added.push(markups.map((markup) => markup.text ?? ""));
      const created = markups.map((markup) => {
        const id = api.nextId++;
        const stored = { id, text: markup.text };
        api.existing.push(stored);
        return api.omitIds ? { text: markup.text } : stored;
      });
      return created;
    },
    async getTextMarkups() {
      return api.existing.map((markup) => ({ ...markup }));
    },
    async removeMarkups(ids) {
      api.removed.push([...ids]);
      const drop = new Set(ids);
      api.existing = api.existing.filter((markup) => typeof markup.id !== "number" || !drop.has(markup.id));
    },
  };
  return api;
}

describe("marcações em lotes", () => {
  it("devolve os ids criados e não mexe nas marcações que já existiam", async () => {
    const api = fakeApi({ existing: [{ id: 1, text: "PT20" }] });
    const ids = await addMarkupBatch(
      api,
      [{ text: "PT20" }, { text: "HEA200" }],
      (item) => item,
    );
    expect(ids).toEqual([10, 11]);
    expect(api.existing.map((markup) => markup.id)).toEqual([1, 10, 11]);
  });

  it("recupera os ids em falta pelo texto, sem apanhar uma marcação anterior igual", async () => {
    const api = fakeApi({ omitIds: true, existing: [{ id: 4, text: "PT20" }] });
    const ids = await addMarkupBatch(
      api,
      [{ text: "PT20" }, { text: "PT20" }, { text: "Laje" }],
      (item) => ({ text: item.text }),
    );
    expect(ids).toEqual([10, 11, 12]);
    expect(ids).not.toContain(4);
  });

  it("remove todas as etiquetas em lotes e nunca pede para apagar as outras marcações", async () => {
    const api = fakeApi();
    await removeMarkupBatches(api, [1, 2, 3, 4, 5], 2);
    expect(api.removed).toEqual([[1, 2], [3, 4], [5]]);
    expect(api.removed.every((chunk) => chunk.length > 0)).toBe(true);
  });
});
