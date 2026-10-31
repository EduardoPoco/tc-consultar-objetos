import { describe, expect, it } from "vitest";
import { hexToRgba } from "../../src/domain/color";
import { toCsv } from "../../src/domain/csv";
import { formatNumberCsv, formatNumberPt, formatValue, normalizeSearch } from "../../src/domain/format";
import { boxExtent, buildLabelText, labelAnchor, toMillimeters } from "../../src/domain/labels";
import {
  capSelection,
  columnsToItems,
  discoverItems,
  filterItems,
  findProperty,
  flattenSelection,
  objectTitle,
  propertyKey,
  sameKeys,
  sortItems,
  toInquiredObject,
} from "../../src/domain/properties";
import { loadSets, loadSettings, saveSets, upsertSet } from "../../src/domain/storage";
import { PropertyType, type InquiredObject, type LabelSettings, type RawObject } from "../../src/domain/types";

function memoryStore(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    dump: () => Object.fromEntries(data),
  };
}

const beam: RawObject = {
  id: 2,
  class: "IfcBeam",
  product: { name: "HEA200" },
  properties: [
    { name: "Identificação", properties: [{ name: "Nome", type: PropertyType.StringValue, value: "Viga V1" }] },
    {
      name: "Perfil",
      properties: [
        { name: "Nome", type: PropertyType.StringValue, value: "HEA200" },
        { name: "Altura", type: PropertyType.LengthMeasure, value: 190 },
      ],
    },
    { name: "Material", properties: [{ name: "Grau", type: PropertyType.StringValue, value: "S275JR" }] },
    {
      name: "Quantidades",
      properties: [
        { name: "Comprimento", type: PropertyType.LengthMeasure, value: 6000 },
        { name: "Peso", type: PropertyType.MassMeasure, value: 253.8 },
      ],
    },
  ],
};

const settings: LabelSettings = {
  labelColor: "#ffe14a",
  highlightColor: "#e07a1f",
  separator: " | ",
  layout: "vertical",
  showUnits: true,
  showPropertyName: false,
  showObjectName: false,
  maxLabels: 20,
};

function inquired(raw: RawObject = beam): InquiredObject {
  return toInquiredObject("modelo-aco", raw, {
    min: { x: 0.3, y: 0, z: 2.8 },
    max: { x: 6.3, y: 0.2, z: 3.2 },
  });
}

describe("formatação", () => {
  it("formata números em pt-PT e para CSV", () => {
    expect(formatNumberPt(1234.5)).toBe("1\u00a0234,5");
    expect(formatNumberPt(42.8)).toBe("42,8");
    expect(formatNumberPt(6000)).toBe("6\u00a0000");
    expect(formatNumberCsv(253.8)).toBe("253,8");
    expect(formatNumberCsv(-12.5)).toBe("-12,5");
    expect(formatNumberCsv(6000)).toBe("6000");
  });

  it("mostra a unidade da API quando pedido", () => {
    expect(formatValue({ name: "Peso", type: PropertyType.MassMeasure, value: 42.8 }, true)).toBe("42,8 kg");
    expect(formatValue({ name: "Peso", type: PropertyType.MassMeasure, value: 42.8 }, false)).toBe("42,8");
    expect(formatValue({ name: "Comprimento", type: PropertyType.LengthMeasure, value: 6000 }, true)).toBe("6\u00a0000 mm");
    expect(formatValue({ name: "Área", type: PropertyType.AreaMeasure, value: 2.45 }, true)).toBe("2,45 m²");
    expect(formatValue({ name: "Volume", type: PropertyType.VolumeMeasure, value: 4.8 }, true)).toBe("4,8 m³");
    expect(formatValue({ name: "Ativo", type: PropertyType.Boolean, value: 1 }, true)).toBe("Sim");
    expect(formatValue({ name: "Nome", type: PropertyType.StringValue, value: "HEA200" }, true)).toBe("HEA200");
  });

  it("ignora acentos na pesquisa", () => {
    expect(normalizeSearch("Área de pintura")).toBe("area de pintura");
  });
});

describe("propriedades", () => {
  it("limita a seleção a 20 objetos", () => {
    const refs = Array.from({ length: 25 }, (_, index) => ({ modelId: "m", runtimeId: index + 1 }));
    const capped = capSelection(refs);
    expect(capped.total).toBe(25);
    expect(capped.truncated).toBe(true);
    expect(capped.kept).toHaveLength(20);
    expect(capped.kept[0].runtimeId).toBe(1);
    expect(capped.kept[19].runtimeId).toBe(20);
  });

  it("achata a seleção por modelo", () => {
    expect(flattenSelection([
      { modelId: "a", objectRuntimeIds: [1, 2] },
      { modelId: "b", objectRuntimeIds: [4] },
    ])).toEqual([
      { modelId: "a", runtimeId: 1 },
      { modelId: "a", runtimeId: 2 },
      { modelId: "b", runtimeId: 4 },
    ]);
  });

  it("usa o nome de identificação como título", () => {
    expect(objectTitle(beam)).toBe("Viga V1");
  });

  it("alinha colunas da tabela de dados com as propriedades do modelo", () => {
    const items = columnsToItems([
      { field: "Perfil.Nome", label: "Perfil" },
      { field: "Quantidades.Peso", label: "Peso" },
    ]);
    expect(items[0].key).toBe(propertyKey("Perfil", "Nome"));
    const object = inquired();
    expect(findProperty(object.raw, items[0])?.value).toBe("HEA200");
    expect(findProperty(object.raw, items[1])?.value).toBe(253.8);
  });

  it("descobre propriedades e ordena em pt-PT", () => {
    const items = sortItems(discoverItems([inquired()]), "asc");
    expect(items.map((item) => item.name)).toEqual(["Altura", "Comprimento", "Grau", "Nome", "Nome", "Peso"]);
    expect(filterItems(items, [inquired()], "s275", true).map((item) => item.key)).toEqual(["Material||Grau"]);
  });

  it("compara conjuntos de chaves sem depender da ordem", () => {
    expect(sameKeys(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameKeys(["a"], ["a", "b"])).toBe(false);
  });
});

describe("etiquetas", () => {
  it("compõe o texto na vertical e na horizontal", () => {
    const object = inquired();
    const items = columnsToItems([
      { field: "Perfil.Nome", label: "Perfil" },
      { field: "Quantidades.Peso", label: "Peso" },
    ]);
    expect(buildLabelText(object, items, settings)).toBe("HEA200\n253,8 kg");
    expect(buildLabelText(object, items, { ...settings, layout: "horizontal", showUnits: false }))
      .toBe("HEA200 | 253,8");
    expect(buildLabelText(object, items, { ...settings, showPropertyName: true, showObjectName: true }))
      .toBe("Viga V1\nPerfil: HEA200\nPeso: 253,8 kg");
  });

  it("converte a caixa delimitadora de metros para milímetros e posiciona a etiqueta ao lado", () => {
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 6, y: 0.2, z: 3.2 } };
    expect(boxExtent(box)).toBe(6);
    const anchor = labelAnchor(box);
    expect(anchor.start).toEqual({ x: 6000, y: 100, z: 3200 });
    expect(anchor.end.x).toBe(6600);
    expect(anchor.end.z).toBe(3600);
  });

  it("não volta a escalar caixas que já estão em milímetros", () => {
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 6000, y: 200, z: 3200 } };
    expect(toMillimeters(box).max.x).toBe(6000);
  });
});

describe("CSV", () => {
  it("usa BOM, separador ponto e vírgula e vírgula decimal", () => {
    const object = inquired();
    const items = columnsToItems([
      { field: "Perfil.Nome", label: "Perfil" },
      { field: "Quantidades.Peso", label: "Peso" },
    ]);
    const csv = toCsv([object], items, true);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Peça;Perfil;Peso\r\n");
    expect(csv).toContain("Viga V1;HEA200;253,8 kg\r\n");
    expect(csv).toContain("Total · 1 peça;;253,8 kg\r\n");
  });

  it("neutraliza fórmulas e escapa ponto e vírgula", () => {
    const raw: RawObject = {
      id: 9,
      properties: [
        {
          name: "Notas",
          properties: [{ name: "Texto", type: PropertyType.StringValue, value: '=CMD("a;b")' }],
        },
      ],
    };
    const object = toInquiredObject("m", raw, null);
    const csv = toCsv([object], discoverItems([object]), false);
    expect(csv).toContain(`"'=CMD(""a;b"")"`);
  });
});

describe("conjuntos guardados", () => {
  it("semeia o conjunto de aço na primeira utilização e respeita uma lista vazia", () => {
    const store = memoryStore();
    const first = loadSets(store);
    expect(first.map((set) => set.name)).toEqual(["Aço: perfil, material, peso"]);
    expect(first[0].keys).toEqual(["Perfil||Nome", "Material||Grau", "Quantidades||Peso"]);
    saveSets(store, []);
    expect(loadSets(store)).toEqual([]);
  });

  it("atualiza um conjunto com o mesmo nome e grava as definições", () => {
    const store = memoryStore();
    const initial = loadSets(store);
    const updated = upsertSet(initial, "Aço: perfil, material, peso", ["Perfil||Nome"]);
    expect(updated).toHaveLength(1);
    expect(updated[0].keys).toEqual(["Perfil||Nome"]);
    const added = upsertSet(updated, "Betão: classe, volume", ["Material||Grau", "Quantidades||Volume"]);
    expect(added).toHaveLength(2);
    expect(loadSettings(store).showUnits).toBe(true);
    expect(loadSettings(store).showObjectName).toBe(false);
    expect(loadSettings(store).showPropertyName).toBe(false);
    const legacy = loadSettings(memoryStore({
      "tc-consultar-objetos:definicoes": JSON.stringify({ showObjectName: true, showUnits: true }),
    }));
    expect(legacy.showObjectName).toBe(false);
    expect(legacy.showPropertyName).toBe(false);
    expect(loadSettings(memoryStore({ "tc-consultar-objetos:definicoes": "{" })).labelColor).toBe("#ffe14a");
  });
});

describe("cor", () => {
  it("converte hexadecimal para RGBA", () => {
    expect(hexToRgba("#e07a1f")).toEqual({ r: 224, g: 122, b: 31, a: 255 });
    expect(hexToRgba("#fff", 200)).toEqual({ r: 255, g: 255, b: 255, a: 200 });
  });
});
