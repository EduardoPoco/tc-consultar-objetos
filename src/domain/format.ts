import { PropertyType, type Property } from "./types";

const UNIT: Record<number, string> = {
  [PropertyType.LengthMeasure]: "mm",
  [PropertyType.AreaMeasure]: "m²",
  [PropertyType.VolumeMeasure]: "m³",
  [PropertyType.MassMeasure]: "kg",
  [PropertyType.AngleMeasure]: "°",
};

export function unitFor(type: number): string {
  return UNIT[type] ?? "";
}

/** Grouped pt-PT number: 1234.5 → "1 234,5" (nbsp as thousands separator). */
export function formatNumberPt(value: number): string {
  if (!Number.isFinite(value)) return "";
  const sign = value < 0 ? "-" : "";
  const fixed = Math.abs(value).toFixed(3);
  const trimmed = fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  const [intPart, frac] = trimmed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return frac ? `${sign}${grouped},${frac}` : `${sign}${grouped}`;
}

/** Excel pt-PT: decimal comma, no thousands separator, so the cell stays numeric. */
export function formatNumberCsv(value: number): string {
  if (!Number.isFinite(value)) return "";
  const sign = value < 0 ? "-" : "";
  const fixed = Math.abs(value).toFixed(6);
  const trimmed = fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return sign + trimmed.replace(".", ",");
}

export function formatValue(property: Property, showUnits: boolean): string {
  const { type, value } = property;
  if (value === null || value === undefined || value === "") return "—";

  if (type === PropertyType.Boolean) {
    return value === 1 || value === "1" || value === true ? "Sim" : "Não";
  }
  if (type === PropertyType.Logical) {
    if (value === true || value === "true" || value === 1 || value === "1") return "Sim";
    if (value === false || value === "false" || value === 0 || value === "0") return "Não";
    return "—";
  }
  if (type === PropertyType.DateTime) {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return String(value);
    const ms = n < 1e12 ? n * 1000 : n;
    return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(ms));
  }
  if (type === PropertyType.StringValue || typeof value === "boolean") {
    return String(value);
  }

  const numeric = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  const isNumeric = typeof value === "number" || (String(value).trim() !== "" && Number.isFinite(numeric));
  if (!isNumeric) return String(value);

  const text = formatNumberPt(numeric);
  const unit = showUnits ? unitFor(type) : "";
  return unit ? `${text} ${unit}` : text;
}

export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
