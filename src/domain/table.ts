import { formatNumberPt, formatValue } from "./format";
import { findProperty } from "./properties";
import type { InquiredObject, PropItem } from "./types";

export interface ParsedQuantity {
  value: number;
  unit: string;
}

export interface InquiryTable {
  columns: PropItem[];
  rows: Array<{ label: string; cells: string[]; sortKeys: Array<number | string | null> }>;
  totalLabel: string;
  totalCells: string[];
}

const MASS_TO_KG: Record<string, number> = { mg: 1e-6, g: 0.001, kg: 1, t: 1000 };
const LENGTH_TO_M: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, km: 1000 };
const AREA_TO_M2: Record<string, number> = { "mm²": 1e-6, "cm²": 0.0001, "m²": 1, "km²": 1e6 };
const VOLUME_TO_M3: Record<string, number> = { "mm³": 1e-9, "cm³": 1e-6, "m³": 1 };

export function parseLocaleNumber(text: string): number | null {
  const compact = text.replace(/[\s\u00a0\u202f]/g, "");
  if (!/^[-+]?\d/.test(compact)) return null;
  if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(compact)) return Number(compact.replace(/\./g, ""));
  if (/^[-+]?\d{1,3}(,\d{3})+$/.test(compact)) return Number(compact.replace(/,/g, ""));
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    return lastComma > lastDot
      ? Number(compact.replace(/\./g, "").replace(",", "."))
      : Number(compact.replace(/,/g, ""));
  }
  if (lastComma >= 0) return Number(compact.replace(",", "."));
  const value = Number(compact);
  return Number.isFinite(value) ? value : null;
}

export function parseQuantity(input: string): ParsedQuantity | null {
  const cleaned = input.replace(/\u00a0/g, " ").replace(/\u202f/g, " ").trim();
  if (!cleaned || cleaned === "—") return null;
  const match = cleaned.match(/^(.*?)(?:\s*(mm²|cm²|m²|km²|mm2|cm2|m2|km2|mm³|cm³|m³|mm3|cm3|m3|kg|t|mm|cm|km|m))?\s*$/i);
  if (!match) return null;
  const value = parseLocaleNumber(match[1].trim());
  if (value == null) return null;
  return { value, unit: canonicalUnit(match[2] ?? "") };
}

function canonicalUnit(unit: string): string {
  const lower = unit.toLowerCase();
  if (lower === "mm2") return "mm²";
  if (lower === "cm2") return "cm²";
  if (lower === "m2") return "m²";
  if (lower === "km2") return "km²";
  if (lower === "mm3") return "mm³";
  if (lower === "cm3") return "cm³";
  if (lower === "m3") return "m³";
  return lower;
}

export function sumQuantities(values: Array<ParsedQuantity | null>): string {
  const present = values.filter((value): value is ParsedQuantity => value != null);
  if (present.length === 0) return "—";
  const units = new Set(present.map((value) => value.unit));
  if (units.size === 1) {
    const unit = present[0].unit;
    const total = present.reduce((sum, value) => sum + value.value, 0);
    return withUnit(total, unit);
  }
  const family = quantityFamily(present[0].unit);
  if (!family || present.some((value) => quantityFamily(value.unit) !== family)) return "—";
  const base = present.reduce((sum, value) => sum + value.value * toBase(value.unit, family), 0);
  const unit = displayUnit(base, family);
  return withUnit(base / toBase(unit, family), unit);
}

function quantityFamily(unit: string): "mass" | "length" | "area" | "volume" | null {
  if (unit in MASS_TO_KG) return "mass";
  if (unit in LENGTH_TO_M) return "length";
  if (unit in AREA_TO_M2) return "area";
  if (unit in VOLUME_TO_M3) return "volume";
  if (unit === "") return null;
  return null;
}

function toBase(unit: string, family: "mass" | "length" | "area" | "volume"): number {
  if (family === "mass") return MASS_TO_KG[unit] ?? 1;
  if (family === "length") return LENGTH_TO_M[unit] ?? 1;
  if (family === "area") return AREA_TO_M2[unit] ?? 1;
  return VOLUME_TO_M3[unit] ?? 1;
}

function displayUnit(base: number, family: "mass" | "length" | "area" | "volume"): string {
  if (family === "mass") return Math.abs(base) >= 1000 ? "t" : "kg";
  if (family === "length") return "m";
  if (family === "area") return "m²";
  return "m³";
}

function withUnit(value: number, unit: string): string {
  const text = formatNumberPt(value);
  return unit ? `${text} ${unit}` : text;
}

export function objectTableLabel(object: InquiredObject): string {
  const mark = assemblyMark(object);
  if (!mark || mark === object.title) return object.title;
  return `${object.title} · ${mark}`;
}

function assemblyMark(object: InquiredObject): string {
  const found: Array<{ rank: number; value: string }> = [];
  for (const set of object.raw.properties ?? []) {
    for (const property of set.properties ?? []) {
      const rank = markRank(property.name);
      if (rank == null) continue;
      const value = String(property.value ?? "").trim();
      if (value) found.push({ rank, value });
    }
  }
  found.sort((a, b) => a.rank - b.rank);
  return found[0]?.value ?? "";
}

function markRank(name: string): number | null {
  const normalized = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (normalized === "conjunto") return 0;
  if (normalized.includes("repere") || normalized.includes("reper")) return 1;
  if (normalized.includes("assembly") && (normalized.includes("mark") || normalized.includes("marque"))) return 1;
  if (normalized === "marca" || normalized === "mark" || normalized === "tag") return 2;
  return null;
}

function cellText(object: InquiredObject, item: PropItem, showUnits: boolean): string {
  const property = findProperty(object.raw, item);
  if (!property || property.value == null || property.value === "") return "—";
  return formatValue(property, showUnits);
}

export function buildInquiryTable(objects: InquiredObject[], columns: PropItem[], showUnits: boolean): InquiryTable {
  const rows = objects.map((object) => {
    const cells = columns.map((column) => cellText(object, column, showUnits));
    const sortKeys: Array<number | string | null> = [
      objectTableLabel(object),
      ...cells.map((cell) => parseQuantity(cell)?.value ?? (cell === "—" ? null : cell)),
    ];
    return { label: objectTableLabel(object), cells, sortKeys };
  });
  const totalCells = columns.map((_, index) => {
    const quantities = rows.map((row) => parseQuantity(row.cells[index] ?? ""));
    if (quantities.every((quantity) => quantity == null)) return "";
    return sumQuantities(quantities);
  });
  return {
    columns,
    rows,
    totalLabel: `${rows.length} ${rows.length === 1 ? "peça" : "peças"}`,
    totalCells,
  };
}

export function sortInquiryTable(table: InquiryTable, column: number, direction: "asc" | "desc"): InquiryTable {
  const rows = [...table.rows].sort((left, right) => {
    const a = left.sortKeys[column] ?? null;
    const b = right.sortKeys[column] ?? null;
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    const compared = typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "pt-PT", { numeric: true, sensitivity: "base" });
    return direction === "asc" ? compared : -compared;
  });
  return { ...table, rows };
}

export function inquiryTableToCsv(table: InquiryTable): string {
  const header = ["Peça", ...table.columns.map((column) => column.label)];
  const lines = [header.map((cell) => csvCell(cell)).join(";")];
  for (const row of table.rows) {
    lines.push([csvCell(row.label), ...row.cells.map((cell) => csvCell(cell === "—" ? "" : cell))].join(";"));
  }
  lines.push([csvCell(`Total · ${table.totalLabel}`), ...table.totalCells.map((cell) => csvCell(cell))].join(";"));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function csvCell(value: string): string {
  let text = value;
  if (/^[=+\-@]/.test(text) && !/^-?\d/.test(text)) text = `'${text}`;
  if (/[";\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}
