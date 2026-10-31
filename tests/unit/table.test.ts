import { describe, expect, it } from "vitest";
import { toCsv } from "../../src/domain/csv";
import { columnsToItems, toInquiredObject } from "../../src/domain/properties";
import { parseLocaleNumber, parseQuantity, sortInquiryTable, sumQuantities, buildInquiryTable, objectTableLabel } from "../../src/domain/table";
import { PropertyType, type InquiredObject, type RawObject } from "../../src/domain/types";

function piece(title: string, conjunto: string, weight: number, area: string): InquiredObject {
  const raw: RawObject = {
    id: title.length,
    properties: [
      {
        name: "Identificação",
        properties: [
          { name: "Nome", type: PropertyType.StringValue, value: title },
          { name: "Conjunto", type: PropertyType.StringValue, value: conjunto },
        ],
      },
      {
        name: "Quantidades",
        properties: [
          { name: "Peso", type: PropertyType.MassMeasure, value: weight },
          { name: "Área", type: PropertyType.StringValue, value: area },
        ],
      },
    ],
  };
  return toInquiredObject("m", raw, null);
}

describe("quantidades", () => {
  it("lê números em pt, fr e en e conserva a unidade", () => {
    expect(parseLocaleNumber("1 234,5")).toBe(1234.5);
    expect(parseLocaleNumber("1.234,5")).toBe(1234.5);
    expect(parseLocaleNumber("1,234.5")).toBe(1234.5);
    expect(parseLocaleNumber("1.234")).toBe(1234);
    expect(parseLocaleNumber("1.5")).toBe(1.5);
    expect(parseQuantity("615,9 kg")).toEqual({ value: 615.9, unit: "kg" });
    expect(parseQuantity("1,5 t")).toEqual({ value: 1.5, unit: "t" });
    expect(parseQuantity("2,45 m²")).toEqual({ value: 2.45, unit: "m²" });
    expect(parseQuantity("4.8 m3")).toEqual({ value: 4.8, unit: "m³" });
    expect(parseQuantity("6 m")).toEqual({ value: 6, unit: "m" });
    expect(parseQuantity("PT20")).toBeNull();
    expect(parseQuantity("S275JR")).toBeNull();
  });

  it("soma a mesma unidade e converte kg com t", () => {
    expect(sumQuantities([
      parseQuantity("253,8 kg"),
      parseQuantity("163,8 kg"),
    ])).toBe("417,6 kg");
    expect(sumQuantities([
      parseQuantity("2,45 m²"),
      parseQuantity("1,55 m²"),
    ])).toBe("4 m²");
    expect(sumQuantities([
      parseQuantity("500 kg"),
      parseQuantity("1,5 t"),
    ])).toBe("2 t");
    expect(sumQuantities([parseQuantity("HEA200"), null])).toBe("—");
  });
});

describe("tabela por peça", () => {
  it("põe uma linha por objeto, identifica o conjunto e totaliza o peso", () => {
    const objects = [piece("Viga V1", "ZSCA11-0", 253.8, "3,72 m²"), piece("Pilar P1", "ZSCA10-0", 163.8, "1,84 m²")];
    const columns = columnsToItems([
      { field: "Quantidades.Peso", label: "Peso" },
      { field: "Quantidades.Área", label: "Área" },
    ]);
    const table = buildInquiryTable(objects, columns, true);
    expect(table.rows.map((row) => row.label)).toEqual(["Viga V1 · ZSCA11-0", "Pilar P1 · ZSCA10-0"]);
    expect(objectTableLabel(objects[0])).toBe("Viga V1 · ZSCA11-0");
    expect(table.totalLabel).toBe("2 peças");
    expect(table.totalCells[0]).toBe("417,6 kg");
    expect(table.totalCells[1]).toBe("5,56 m²");
    const sorted = sortInquiryTable(table, 1, "asc");
    expect(sorted.rows[0].label).toContain("Pilar");
    const csv = toCsv(objects, columns, true);
    expect(csv.startsWith("\uFEFFPeça;Peso;Área\r\n")).toBe(true);
    expect(csv).toContain("Total · 2 peças;417,6 kg;5,56 m²\r\n");
  });
});
