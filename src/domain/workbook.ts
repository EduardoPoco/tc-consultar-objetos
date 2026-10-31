import * as XLSX from "xlsx";
import { buildTable, detectHeaderRow, type SheetTable } from "./fabric";

export function readWorkbook(buffer: ArrayBuffer, headerRow?: number): SheetTable {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0] ?? "Folha";
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { sheetName, headerRow: 1, columns: [], rows: [] };
  }
  const formatted = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
  const formattedRows = formatted.map((row) => (row ?? []).map((cell) => (cell == null ? "" : String(cell))));
  const chosen = headerRow && headerRow > 0 ? headerRow : detectHeaderRow(formattedRows);
  return buildTable(sheetName, formattedRows, raw, chosen);
}
