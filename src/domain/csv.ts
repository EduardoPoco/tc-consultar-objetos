import { formatNumberCsv, formatValue } from "./format";
import { columnHeader, findProperty } from "./properties";
import { PropertyType, type InquiredObject, type PropItem } from "./types";

const NUMERIC_TYPES = new Set<number>([
  PropertyType.LengthMeasure,
  PropertyType.AreaMeasure,
  PropertyType.VolumeMeasure,
  PropertyType.MassMeasure,
  PropertyType.AngleMeasure,
  PropertyType.IntValue,
  PropertyType.DoubleValue,
]);

function csvCell(value: string, numeric: boolean): string {
  let text = value;
  if (!numeric && /^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[";\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function cellFor(object: InquiredObject, item: PropItem): { text: string; numeric: boolean } {
  const property = findProperty(object.raw, item);
  if (!property || property.value === null || property.value === undefined || property.value === "") {
    return { text: "", numeric: false };
  }
  if (NUMERIC_TYPES.has(property.type)) {
    const numeric = typeof property.value === "number"
      ? property.value
      : Number(String(property.value).replace(",", "."));
    if (Number.isFinite(numeric)) return { text: formatNumberCsv(numeric), numeric: true };
  }
  return { text: formatValue(property, false), numeric: false };
}

export function toCsv(objects: InquiredObject[], items: PropItem[], showUnits: boolean): string {
  const headers = ["Propriedade", ...objects.map((object) => uniqueTitle(object, objects))];
  const lines = [headers.map((header) => csvCell(header, false)).join(";")];
  for (const item of items) {
    const row = [csvCell(columnHeader(item, objects, showUnits), false)];
    for (const object of objects) {
      const cell = cellFor(object, item);
      row.push(csvCell(cell.text, cell.numeric));
    }
    lines.push(row.join(";"));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function uniqueTitle(object: InquiredObject, objects: InquiredObject[]): string {
  const duplicates = objects.filter((candidate) => candidate.title === object.title).length > 1;
  return duplicates ? `${object.title} #${object.runtimeId}` : object.title;
}
