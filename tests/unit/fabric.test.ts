import { describe, expect, it } from "vitest";
import {
  applyFabrication,
  buildDataset,
  buildTable,
  defaultKeyColumn,
  detectHeaderRow,
  interpretCell,
  nameColumns,
  normalizeKey,
} from "../../src/domain/fabric";
import { clearDataset, loadDataset, loadMappings, saveDataset, saveMappings } from "../../src/domain/fabricStore";
import { PropertyType, type InquiredObject } from "../../src/domain/types";
import * as XLSX from "xlsx";
import { readWorkbook } from "../../src/domain/workbook";

const headers = [
  "Auto_ID", "#", "Nº Sub-Obra", "Lista", "Prioridade", "Conjunto", "Tipo", "Quantidade croquis",
  "Desenho", "Rev", "", "", "Link", "Quantidade", "Perfil", "Material", "Dimensão 1 [mm]", "Dimensão 2 [mm]",
  "Peso unitário", "Peso total", "Área de pintura", "Descrição", "Peso total", "Área de pintura total",
  "Tratamento de superfície", "Máquina", "CNC/Estado", "Quem", "Quant", "Data", "", "Lote", "Quem", "Processo",
  "Quant", "Data", "Lote Mat. Adição", "Quem", "Quant", "Data", "Quem", "Quant", "Data", "Soldadura Lote",
  "Quem", "Quant.", "Data", "Quem", "Quant.", "Data", "Quant. Verificada", "Quant. Desempenada", "Data",
  "Lote Pintura", "Quem", "Quant.", "Data", "Quem", "Quant.", "Data", "Volume", "%", "%", "%", "%", "%", "%", "%",
];

const groups = Array.from({ length: headers.length }, () => "");
groups[3] = "Dürr CTS GmbH";
groups[8] = "[DE04-2104065] Shell Gent";
groups[25] = "Planeamento Corte";
groups[28] = "Maquinação";
groups[33] = "Corte";
groups[37] = "Armação";
groups[41] = "Inspecção de peças soltas";
groups[44] = "Soldadura";
groups[48] = "Cont. Dimensional";
groups[51] = "Desempeno";
groups[54] = "Pintura";
groups[58] = "Expedição";
groups[61] = "Corte";
groups[62] = "Armação";
groups[63] = "Inspecção de peças soltas";
groups[64] = "Soldadura";
groups[65] = "Cont. Dimensional";
groups[66] = "Pintura";
groups[67] = "Expedição";

function object(title: string, conjunto: string): InquiredObject {
  return {
    modelId: "m",
    runtimeId: title.length,
    title,
    className: "IfcElement",
    box: null,
    raw: {
      id: title.length,
      properties: [
        { name: "Identificação", properties: [{ name: "Conjunto", type: PropertyType.StringValue, value: conjunto }, { name: "Nome", type: PropertyType.StringValue, value: title }] },
      ],
    },
  };
}

describe("folha de fabrico", () => {
  it("encontra o cabeçalho e distingue colunas repetidas pelo grupo", () => {
    const rows = Array.from({ length: 7 }, () => ["Cliente"]);
    rows.push(headers);
    expect(detectHeaderRow(rows)).toBe(8);
    const names = nameColumns(headers, groups);
    expect(names[5]).toBe("Conjunto");
    expect(names[3]).toBe("Lista");
    expect(names[25]).toBe("Planeamento Corte · Máquina");
    expect(names[35]).toBe("Corte · Data");
    expect(names[39]).toBe("Armação · Data");
    expect(names[46]).toBe("Soldadura · Data");
    expect(names[61]).toBe("Corte · %");
    expect(names[67]).toBe("Expedição · %");
    expect(names[19]).toBe("Peso total");
    expect(names[22]).toBe("Peso total (2)");
  });

  it("resume várias datas numa célula pela última data e pela quantidade total", () => {
    const cell = interpretCell("17/09/2026 - 149\n18/09/2026 - 13", "17/09/2026 - 149\n18/09/2026 - 13", "Data");
    expect(cell.kind).toBe("date");
    expect(cell.text).toBe("18/09/2026 · 162");
    const percent = interpretCell(0.999999992, "$100.00%", "%");
    expect(percent.kind).toBe("percent");
    expect(percent.numeric).toBe(100);
    expect(percent.text).toBe("100%");
  });

  it("liga as linhas aos objetos e prefere a linha de conjunto quando a chave se repete", () => {
    const formatted = [
      ["titulo"],
      ["Conjunto", "Tipo", "Perfil", "Data"],
    ];
    const raw = [
      ["titulo"],
      ["Conjunto", "Tipo", "Perfil", "Data"],
      ["ZSCA10-0", "Croqui", "HEA120", "01/09/2026 - 2\n02/09/2026 - 3"],
      ["ZSCA10-0", "Conjunto", "Steel Structure", "05/09/2026 - 8"],
      ["ZSCA99-0", "Conjunto", "IPE200", ""],
      ["", "Conjunto", "L50", ""],
    ];
    const groups = ["", "", "", "Corte"];
    const table = buildTable("Produção", [formatted[0], groups, formatted[1]], [raw[0], groups, raw[1], raw[2], raw[3], raw[4], raw[5]], 3);
    expect(table.columns.map((column) => column.name)).toContain("Corte · Data");
    expect(defaultKeyColumn(table.columns)).toBe(0);
    const dataset = buildDataset({
      table,
      keyColumn: 0,
      keyProperty: { setName: "Identificação", name: "Conjunto" },
      fields: [
        { column: 2, setName: "Fabrico", propertyName: "Perfil" },
        { column: 3, setName: "Fabrico", propertyName: "Corte · Data" },
      ],
      objects: [object("Pilar P1", "ZSCA10-0"), object("Laje L1", "LAJE-L1")],
      projectId: "demonstracao",
      fileName: "fabrico.xlsx",
    });
    expect(dataset.report.duplicateKeys).toBe(1);
    expect(dataset.report.matchedObjects).toBe(1);
    expect(dataset.report.unmatchedKeys).toContain("ZSCA99-0");
    expect(dataset.report.objectsWithoutRow).toEqual(["Laje L1"]);
    expect(dataset.report.rowsWithoutKey).toBe(1);
    const applied = applyFabrication(object("Pilar P1", "zsca10-0"), dataset);
    const fabrico = applied.raw.properties?.find((set) => set.name === "Fabrico");
    expect(fabrico?.properties?.find((property) => property.name === "Perfil")?.value).toBe("Steel Structure");
    expect(fabrico?.properties?.find((property) => property.name === "Corte · Data")?.value).toBe("05/09/2026 · 8");
    expect(normalizeKey(" ZSCA10-0 ")).toBe("zsca10-0");
  });

  it("lê um xlsx com o cabeçalho na linha indicada", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Gestão da Produção"],
      [],
      ["Conjunto", "Tipo"],
      ["ZSCA11-0", "Conjunto"],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Produção");
    const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const table = readWorkbook(buffer, 3);
    expect(table.headerRow).toBe(3);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0][0].text).toBe("ZSCA11-0");
  });
});

describe("persistência local", () => {
  it("guarda o mapeamento e os dados por projeto", () => {
    const memory = new Map<string, string>();
    const store = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    };
    saveMappings(store, [{
      id: "map-1",
      name: "Fabrico Shell",
      headerRow: 8,
      keyColumnName: "Conjunto",
      keyProperty: { setName: "Identificação", name: "Conjunto" },
      columns: [{ columnName: "Corte · Data", setName: "Fabrico", propertyName: "Corte · Data" }],
    }]);
    expect(loadMappings(store)[0].keyColumnName).toBe("Conjunto");
    const dataset = buildDataset({
      table: buildTable("Folha", [["Conjunto"], ["ZSCA1-0"]], [["Conjunto"], ["ZSCA1-0"]], 1),
      keyColumn: 0,
      keyProperty: { setName: "Identificação", name: "Conjunto" },
      fields: [],
      objects: [],
      projectId: "obra-3221",
      fileName: "a.xlsx",
    });
    saveDataset(store, dataset);
    expect(loadDataset(store, "obra-3221")?.fileName).toBe("a.xlsx");
    expect(loadDataset(store, "outra")).toBeNull();
    clearDataset(store, "obra-3221");
    expect(loadDataset(store, "obra-3221")).toBeNull();
  });
});
