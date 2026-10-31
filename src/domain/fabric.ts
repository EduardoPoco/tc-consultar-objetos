import { findProperty, propertyKey } from "./properties";
import { PropertyType, type InquiredObject, type PropertySet } from "./types";

export type CellKind = "empty" | "text" | "number" | "percent" | "date";

export interface SheetCell {
  text: string;
  numeric?: number;
  kind: CellKind;
}

export interface SheetColumn {
  index: number;
  header: string;
  name: string;
  samples: string[];
}

export interface SheetTable {
  sheetName: string;
  headerRow: number;
  columns: SheetColumn[];
  rows: SheetCell[][];
}

export interface MappedValue {
  setName: string;
  name: string;
  text: string;
  numeric?: number;
  kind: CellKind;
}

export interface FabricRecord {
  key: string;
  label: string;
  values: MappedValue[];
}

export interface KeyProperty {
  setName: string;
  name: string;
}

export interface FabricationDataset {
  projectId: string;
  fileName: string;
  importedAt: string;
  keyProperty: KeyProperty;
  records: FabricRecord[];
  report: MatchReport;
}

export interface MatchReport {
  rowCount: number;
  rowsWithoutKey: number;
  matchedObjects: number;
  unmatchedCount: number;
  unmatchedKeys: string[];
  objectsWithoutRowCount: number;
  objectsWithoutRow: string[];
  duplicateKeys: number;
}

export interface ColumnLink {
  columnName: string;
  setName: string;
  propertyName: string;
}

export interface SavedMapping {
  id: string;
  name: string;
  headerRow: number;
  keyColumnName: string;
  keyProperty: KeyProperty;
  columns: ColumnLink[];
}

const IDENTITY = /^(auto_id|#|n[ºo°.]|lista|prioridade|conjunto|tipo|quantidade|desenho|rev|revis|link|perfil|material|dimens|peso|área|area|descri|tratamento)/i;
const MAX_GROUP_DISTANCE = 2;

export function normalizeKey(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function detectHeaderRow(rows: string[][]): number {
  let bestRow = 1;
  let bestScore = -1;
  const limit = Math.min(rows.length, 40);
  for (let index = 0; index < limit; index += 1) {
    const cells = (rows[index] ?? []).map((cell) => String(cell ?? "").trim()).filter(Boolean);
    const textual = cells.filter((cell) => /[A-Za-zÀ-ÿ]/.test(cell) && !cell.startsWith("$") && !/^\d/.test(cell));
    if (textual.length > bestScore) {
      bestScore = textual.length;
      bestRow = index + 1;
    }
  }
  return bestRow;
}

function cleanHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isGroupLabel(value: string): boolean {
  const text = cleanHeader(value);
  if (!text || text.length > 40) return false;
  if (text.startsWith("$") || text.startsWith("[")) return false;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text)) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(text)) return false;
  return true;
}

function isIdentity(header: string): boolean {
  return IDENTITY.test(cleanHeader(header));
}

export function nameColumns(headers: string[], groupRow: string[]): string[] {
  const clean = headers.map((header) => cleanHeader(header));
  const counts = new Map<string, number>();
  for (const header of clean) {
    if (!header) continue;
    const key = header.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const anchors = clean.flatMap((header, index) => {
    const label = cleanHeader(groupRow[index] ?? "");
    if (!header || isIdentity(header) || !isGroupLabel(label)) return [];
    return [{ index, label }];
  });
  const named = clean.map((header, index) => {
    if (!header) return "";
    const onColumn = anchors.find((anchor) => anchor.index === index);
    const duplicated = (counts.get(header.toLowerCase()) ?? 0) > 1;
    const nearest = duplicated ? nearestAnchor(anchors, index) : undefined;
    const group = onColumn?.label ?? nearest?.label;
    return group ? `${group} · ${header}` : header;
  });
  const seen = new Map<string, number>();
  return named.map((name) => {
    if (!name) return "";
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name} (${count})`;
  });
}

function nearestAnchor(anchors: Array<{ index: number; label: string }>, index: number): { index: number; label: string } | undefined {
  let best: { index: number; label: string } | undefined;
  let bestDistance = MAX_GROUP_DISTANCE + 1;
  for (const anchor of anchors) {
    const distance = Math.abs(anchor.index - index);
    if (distance === 0 || distance > MAX_GROUP_DISTANCE) continue;
    if (distance < bestDistance || (distance === bestDistance && anchor.index < index && (best?.index ?? -1) > index)) {
      best = anchor;
      bestDistance = distance;
    }
  }
  return best;
}

export function interpretCell(raw: unknown, formatted: string, header = ""): SheetCell {
  const rawText = raw == null ? "" : String(raw);
  const display = (formatted.trim() || rawText).replace(/^\$/, "").trim();
  const quantityDate = parseQuantityDates(rawText.includes("/") ? rawText : display);
  if (quantityDate) {
    const date = formatDate(quantityDate.last);
    const total = formatQuantity(quantityDate.total);
    return {
      text: `${date} · ${total}`,
      numeric: quantityDate.last.getTime(),
      kind: "date",
    };
  }
  const headerIsPercent = cleanHeader(header) === "%" || cleanHeader(header).endsWith("%");
  const formattedIsPercent = display.includes("%");
  if ((headerIsPercent || formattedIsPercent) && typeof raw === "number" && Number.isFinite(raw)) {
    const percent = Math.round((raw >= 0 && raw <= 1 ? raw * 100 : raw) * 10) / 10;
    return { text: `${formatQuantity(percent)}%`, numeric: percent, kind: "percent" };
  }
  const singleDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(display);
  if (singleDate) {
    const date = new Date(Number(singleDate[3]), Number(singleDate[2]) - 1, Number(singleDate[1]));
    return { text: display, numeric: date.getTime(), kind: "date" };
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { text: display || String(raw), numeric: raw, kind: "number" };
  }
  if (!display) return { text: "", kind: "empty" };
  return { text: display, kind: "text" };
}

function parseQuantityDates(value: string): { last: Date; total: number } | null {
  const matches = [...value.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–]\s*(\d+(?:[.,]\d+)?)/g)];
  if (matches.length === 0) return null;
  let last: Date | null = null;
  let total = 0;
  for (const match of matches) {
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    total += Number(match[4].replace(",", "."));
    if (!last || date.getTime() > last.getTime()) last = date;
  }
  return last ? { last, total } : null;
}

function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

function formatQuantity(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
}

export function buildTable(
  sheetName: string,
  formattedRows: string[][],
  rawRows: unknown[][],
  headerRow: number,
): SheetTable {
  const headerIndex = Math.max(0, headerRow - 1);
  const headers = (formattedRows[headerIndex] ?? []).map((cell) => cleanHeader(String(cell ?? "")));
  const groupRow = (formattedRows[headerIndex - 1] ?? []).map((cell) => String(cell ?? ""));
  const names = nameColumns(headers, groupRow);
  const body = rawRows.slice(headerIndex + 1);
  const formattedBody = formattedRows.slice(headerIndex + 1);
  const columns: SheetColumn[] = names.flatMap((name, index) => {
    if (!name) return [];
    return [{
      index,
      header: headers[index] ?? name,
      name,
      samples: [],
    }];
  });
  const rows: SheetCell[][] = [];
  for (let rowIndex = 0; rowIndex < body.length; rowIndex += 1) {
    const raw = body[rowIndex] ?? [];
    const formatted = formattedBody[rowIndex] ?? [];
    if (raw.every((cell) => cell == null || String(cell).trim() === "") && formatted.every((cell) => String(cell ?? "").trim() === "")) {
      continue;
    }
    const cells = headers.map((header, index) => interpretCell(raw[index], String(formatted[index] ?? ""), header));
    rows.push(cells);
    for (const column of columns) {
      const text = cells[column.index]?.text ?? "";
      if (text && column.samples.length < 3) column.samples.push(text);
    }
  }
  return { sheetName, headerRow, columns, rows };
}

export interface ImportRequest {
  table: SheetTable;
  keyColumn: number;
  keyProperty: KeyProperty;
  fields: Array<{ column: number; setName: string; propertyName: string }>;
  objects: InquiredObject[];
  projectId: string;
  fileName: string;
}

export function buildDataset(request: ImportRequest): FabricationDataset {
  const tipoColumn = request.table.columns.find((column) => column.header.toLowerCase() === "tipo");
  const grouped = new Map<string, { label: string; tipo: string; values: MappedValue[] }[]>();
  let rowsWithoutKey = 0;
  for (const row of request.table.rows) {
    const keyCell = row[request.keyColumn];
    const label = keyCell?.text?.trim() ?? "";
    const key = normalizeKey(label);
    if (!key) {
      rowsWithoutKey += 1;
      continue;
    }
    const tipo = tipoColumn ? row[tipoColumn.index]?.text ?? "" : "";
    const values = request.fields.flatMap((field) => {
      const cell = row[field.column];
      if (!cell || cell.kind === "empty" || !cell.text) return [];
      return [{
        setName: field.setName.trim() || "Fabrico",
        name: field.propertyName.trim() || request.table.columns.find((column) => column.index === field.column)?.name || "Valor",
        text: cell.text,
        numeric: cell.numeric,
        kind: cell.kind,
      }];
    });
    const list = grouped.get(key) ?? [];
    list.push({ label, tipo, values });
    grouped.set(key, list);
  }

  const records: FabricRecord[] = [];
  let duplicateKeys = 0;
  for (const [key, list] of grouped) {
    if (list.length > 1) duplicateKeys += 1;
    const preferred = list.find((row) => normalizeKey(row.tipo) === "conjunto") ?? list[0];
    records.push({ key, label: preferred.label, values: preferred.values });
  }

  const objectKeys = request.objects.flatMap((object) => {
    const key = objectKey(object, request.keyProperty);
    return key ? [{ object, key }] : [{ object, key: "" }];
  });
  const recordKeys = new Set(records.map((record) => record.key));
  const used = new Set<string>();
  const objectsWithoutRow: string[] = [];
  for (const entry of objectKeys) {
    if (!entry.key || !recordKeys.has(entry.key)) {
      objectsWithoutRow.push(entry.object.title);
      continue;
    }
    used.add(entry.key);
  }
  const unmatched = records.filter((record) => !used.has(record.key));
  return {
    projectId: request.projectId,
    fileName: request.fileName,
    importedAt: new Date().toISOString(),
    keyProperty: request.keyProperty,
    records,
    report: {
      rowCount: request.table.rows.length,
      rowsWithoutKey,
      matchedObjects: request.objects.length - objectsWithoutRow.length,
      unmatchedCount: unmatched.length,
      unmatchedKeys: unmatched.slice(0, 12).map((record) => record.label),
      objectsWithoutRowCount: objectsWithoutRow.length,
      objectsWithoutRow: objectsWithoutRow.slice(0, 12),
      duplicateKeys,
    },
  };
}

export function objectKey(object: InquiredObject, property: KeyProperty): string {
  const found = findProperty(object.raw, {
    key: propertyKey(property.setName, property.name),
    setName: property.setName,
    name: property.name,
    label: property.name,
  });
  if (found?.value == null) return "";
  return normalizeKey(String(found.value));
}

export function applyFabrication(object: InquiredObject, dataset: FabricationDataset | null): InquiredObject {
  if (!dataset) return object;
  const key = objectKey(object, dataset.keyProperty);
  const record = key ? dataset.records.find((item) => item.key === key) : undefined;
  if (!record || record.values.length === 0) return object;
  const sets: PropertySet[] = (object.raw.properties ?? []).map((set) => ({
    name: set.name,
    properties: [...(set.properties ?? [])],
  }));
  for (const value of record.values) {
    let set = sets.find((item) => (item.name ?? "") === value.setName);
    if (!set) {
      set = { name: value.setName, properties: [] };
      sets.push(set);
    }
    const properties = set.properties ?? [];
    const next = { name: value.name, value: value.text, type: PropertyType.StringValue };
    const existing = properties.findIndex((property) => property.name === value.name);
    if (existing >= 0) properties[existing] = next;
    else properties.push(next);
    set.properties = properties;
  }
  return { ...object, raw: { ...object.raw, properties: sets } };
}

export function defaultKeyColumn(columns: SheetColumn[]): number {
  return columns.find((column) => column.header.toLowerCase() === "conjunto")?.index
    ?? columns.find((column) => /desenho|perfil|marca/i.test(column.header))?.index
    ?? columns[0]?.index
    ?? 0;
}

export function suggestField(column: SheetColumn): boolean {
  if (column.header.toLowerCase() === "conjunto") return false;
  return /^(tipo|perfil|material|máquina|maquina|tratamento|cnc)/i.test(column.header)
    || / · (%|data)$/i.test(column.name)
    || column.name.endsWith("· %")
    || column.name.endsWith("· Data");
}
