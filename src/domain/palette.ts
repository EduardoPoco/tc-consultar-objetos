import { findProperty } from "./properties";
import type { InquiredObject, PropItem } from "./types";

export type ColorScale = "auto" | "categories" | "gradient";

export interface LegendStop {
  label: string;
  color: string;
}

export interface ObjectColor {
  modelId: string;
  runtimeId: number;
  color: string;
}

export interface ColorPlan {
  scale: "categories" | "gradient";
  legend: LegendStop[];
  colors: ObjectColor[];
}

const CATEGORIES = ["#1d6fbf", "#e07a1f", "#1f8a4c", "#c0392b", "#7b4ea3", "#0e7c86", "#b08900", "#5c6b7a"];
const EMPTY = "#b7c3ce";

interface Reading {
  kind: "empty" | "percent" | "date" | "number" | "text";
  numeric?: number;
  label: string;
}

export function planColors(objects: InquiredObject[], item: PropItem, scale: ColorScale): ColorPlan {
  const readings = objects.map((object) => ({ object, reading: readValue(object, item) }));
  const useful = readings.map((entry) => entry.reading).filter((reading) => reading.kind !== "empty");
  const resolved = scale === "auto" ? inferScale(useful) : scale;
  if (resolved === "gradient" && useful.some((reading) => reading.numeric != null && reading.kind !== "text")) {
    return gradientPlan(readings);
  }
  return categoryPlan(readings);
}

function inferScale(readings: Reading[]): "categories" | "gradient" {
  if (readings.length === 0) return "categories";
  const numeric = readings.filter((reading) => reading.kind === "percent" || reading.kind === "date" || reading.kind === "number").length;
  return numeric / readings.length >= 0.6 ? "gradient" : "categories";
}

function gradientPlan(readings: Array<{ object: InquiredObject; reading: Reading }>): ColorPlan {
  const numbers = readings.flatMap((entry) => entry.reading.numeric == null || entry.reading.kind === "text" ? [] : [entry.reading]);
  const min = Math.min(...numbers.map((reading) => reading.numeric ?? 0));
  const max = Math.max(...numbers.map((reading) => reading.numeric ?? 0));
  const span = max - min || 1;
  const kind = numbers[0]?.kind ?? "number";
  const legend = [0, 0.5, 1].map((amount) => ({
    label: formatReading(kind, min + span * amount),
    color: ramp(amount),
  }));
  const hasEmpty = readings.some((entry) => entry.reading.kind === "empty" || entry.reading.numeric == null);
  if (hasEmpty) legend.push({ label: "Sem valor", color: EMPTY });
  return {
    scale: "gradient",
    legend,
    colors: readings.map(({ object, reading }) => ({
      modelId: object.modelId,
      runtimeId: object.runtimeId,
      color: reading.numeric == null || reading.kind === "text" || reading.kind === "empty"
        ? EMPTY
        : ramp((reading.numeric - min) / span),
    })),
  };
}

function categoryPlan(readings: Array<{ object: InquiredObject; reading: Reading }>): ColorPlan {
  const labels = [...new Set(readings.map((entry) => entry.reading.kind === "empty" ? "Sem valor" : entry.reading.label))]
    .sort((a, b) => a.localeCompare(b, "pt-PT"));
  const legend = labels.map((label, index) => ({
    label,
    color: label === "Sem valor" ? EMPTY : CATEGORIES[index % CATEGORIES.length],
  }));
  const byLabel = new Map(legend.map((entry) => [entry.label, entry.color]));
  return {
    scale: "categories",
    legend,
    colors: readings.map(({ object, reading }) => ({
      modelId: object.modelId,
      runtimeId: object.runtimeId,
      color: byLabel.get(reading.kind === "empty" ? "Sem valor" : reading.label) ?? EMPTY,
    })),
  };
}

function readValue(object: InquiredObject, item: PropItem): Reading {
  const property = findProperty(object.raw, item);
  const text = property?.value == null ? "" : String(property.value).trim();
  if (!text || text === "—") return { kind: "empty", label: "Sem valor" };
  const percent = text.match(/^(-?\d+(?:[.,]\d+)?)\s*%$/);
  if (percent) return { kind: "percent", numeric: Number(percent[1].replace(",", ".")), label: text };
  const date = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (date) {
    return {
      kind: "date",
      numeric: new Date(Number(date[3]), Number(date[2]) - 1, Number(date[1])).getTime(),
      label: `${date[1]}/${date[2]}/${date[3]}`,
    };
  }
  const number = text.match(/^(-?\d+(?:[.,]\d+)?)(?:\s*(?:kg|mm|m²|m2|m³|m3))?$/i);
  if (number) return { kind: "number", numeric: Number(number[1].replace(",", ".")), label: text };
  return { kind: "text", label: text };
}

function formatReading(kind: Reading["kind"], value: number): string {
  if (kind === "percent") return `${Math.round(value)}%`;
  if (kind === "date") {
    const date = new Date(value);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${date.getFullYear()}`;
  }
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

export function ramp(amount: number): string {
  const t = Math.min(1, Math.max(0, amount));
  const stops = [
    { t: 0, r: 192, g: 57, b: 43 },
    { t: 0.5, r: 224, g: 161, b: 6 },
    { t: 1, r: 30, g: 140, b: 69 },
  ];
  const next = stops.findIndex((stop) => stop.t >= t);
  const to = stops[Math.max(next, 1)];
  const from = stops[Math.max(next - 1, 0)];
  const span = to.t - from.t || 1;
  const local = (t - from.t) / span;
  const channel = (start: number, end: number) => Math.round(start + (end - start) * local);
  return `#${[channel(from.r, to.r), channel(from.g, to.g), channel(from.b, to.b)].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}
