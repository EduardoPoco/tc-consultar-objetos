import { describe, expect, it } from "vitest";
import { addMarkupBatch, placeTextMarkups, removeMarkupBatches, type MarkupRef } from "../../src/host/labelBatches";

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
    const result = await addMarkupBatch(
      api,
      [{ text: "PT20" }, { text: "HEA200" }],
      (item) => item,
    );
    expect(result.ids).toEqual([10, 11]);
    expect(result.accepted).toBe(2);
    expect(api.existing.map((markup) => markup.id)).toEqual([1, 10, 11]);
  });

  it("recupera os ids em falta pelo texto, sem apanhar uma marcação anterior igual", async () => {
    const api = fakeApi({ omitIds: true, existing: [{ id: 4, text: "PT20" }] });
    const result = await addMarkupBatch(
      api,
      [{ text: "PT20" }, { text: "PT20" }, { text: "Laje" }],
      (item) => ({ text: item.text }),
    );
    expect(result.ids).toEqual([10, 11, 12]);
    expect(result.ids).not.toContain(4);
    expect(result.accepted).toBe(3);
  });

  it("remove todas as etiquetas em lotes e nunca pede para apagar as outras marcações", async () => {
    const api = fakeApi();
    await removeMarkupBatches(api, [1, 2, 3, 4, 5], 2);
    expect(api.removed).toEqual([[1, 2], [3, 4], [5]]);
    expect(api.removed.every((chunk) => chunk.length > 0)).toBe(true);
  });

  it("cria as etiquetas antes de ler as que já existiam", async () => {
    const calls: string[] = [];
    const api = {
      async addTextMarkup(markups: Array<{ text?: string }>) {
        calls.push("add");
        return markups.map((markup, index) => ({ id: index + 1, text: markup.text }));
      },
      async getTextMarkups() {
        calls.push("get");
        return [];
      },
    };
    const result = await placeTextMarkups(api, [{ text: "HEA200" }], (item) => item, (item) => item);
    expect(result.ids).toEqual([1]);
    expect(calls).toEqual(["add"]);
  });

  it("repete ligada ao objeto quando a primeira resposta vem vazia", async () => {
    const sent: Array<Array<{ objectId?: number }>> = [];
    const api = {
      async addTextMarkup(markups: Array<{ text?: string; objectId?: number }>) {
        sent.push(markups);
        if (sent.length === 1) return [];
        return markups.map((markup, index) => ({ id: index + 5, text: markup.text }));
      },
      async getTextMarkups() {
        return [];
      },
    };
    const result = await placeTextMarkups(
      api,
      [{ text: "HEA200" }],
      (item) => ({ text: item.text }),
      (item) => ({ text: item.text, objectId: 7 }),
    );
    expect(sent).toHaveLength(2);
    expect(sent[0][0]?.objectId).toBeUndefined();
    expect(sent[1][0]?.objectId).toBe(7);
    expect(result.ids).toEqual([5]);
  });

  it("explica a lista vazia e uma rejeição, em vez de as ignorar", async () => {
    const empty = {
      async addTextMarkup() {
        return [];
      },
      async getTextMarkups() {
        return [];
      },
    };
    await expect(placeTextMarkups(empty, [{ text: "A" }], (item) => item, (item) => item))
      .rejects.toThrow(/lista vazia/);

    const rejected = {
      async addTextMarkup() {
        throw new Error("modelo sem permissão");
      },
      async getTextMarkups() {
        return [];
      },
    };
    await expect(placeTextMarkups(rejected, [{ text: "A" }], (item) => item, (item) => item))
      .rejects.toThrow(/modelo sem permissão/);
  });

  it("não fica à espera se a lista de marcações não responde", async () => {
    const api = {
      async addTextMarkup(markups: Array<{ text?: string }>) {
        return markups.map((markup) => ({ text: markup.text }));
      },
      getTextMarkups() {
        return new Promise<MarkupRef[]>(() => undefined);
      },
    };
    const started = Date.now();
    const result = await addMarkupBatch(api, [{ text: "A" }], (item) => item, 30);
    expect(Date.now() - started).toBeLessThan(500);
    expect(result.accepted).toBe(1);
    expect(result.ids).toEqual([]);
  });
});
