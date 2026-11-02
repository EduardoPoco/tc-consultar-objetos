import { formatValue } from "./format";
import { findProperty } from "./properties";
import type { Box3, InquiredObject, LabelSettings, PropItem, Vector3 } from "./types";

export function boxExtent(box: Box3): number {
  return Math.max(
    Math.abs(box.max.x - box.min.x),
    Math.abs(box.max.y - box.min.y),
    Math.abs(box.max.z - box.min.z),
  );
}

const METRE_PART = 300;
const METRE_SITE = 2000;

function coordinateMagnitude(box: Box3): number {
  return Math.max(
    Math.abs(box.min.x), Math.abs(box.min.y), Math.abs(box.min.z),
    Math.abs(box.max.x), Math.abs(box.max.y), Math.abs(box.max.z),
  );
}

/**
 * Markup picks are millimetres. Object positions are metres, and a bounding box
 * uses the same world unless the numbers are already millimetres.
 * A part longer than 300 m, a coordinate beyond 2 km, or a padded position
 * (extent under 1) sitting more than 300 units from the origin is left as-is.
 * Scaling those again would park the label kilometres away from the piece.
 */
export function markupScale(box: Box3): number {
  const extent = boxExtent(box);
  const magnitude = coordinateMagnitude(box);
  if (extent > METRE_PART) return 1;
  if (extent < 1 && magnitude > METRE_PART) return 1;
  if (magnitude > METRE_SITE) return 1;
  return 1000;
}

export function toMillimeters(box: Box3): Box3 {
  const scale = markupScale(box);
  const scaleVector = (value: Vector3): Vector3 => ({
    x: value.x * scale,
    y: value.y * scale,
    z: value.z * scale,
  });
  return { min: scaleVector(box.min), max: scaleVector(box.max) };
}

export function labelAnchor(box: Box3): { start: Vector3; end: Vector3 } {
  const millimeters = toMillimeters(box);
  const start = {
    x: millimeters.max.x,
    y: (millimeters.min.y + millimeters.max.y) / 2,
    z: millimeters.max.z,
  };
  return {
    start,
    end: { x: start.x + 600, y: start.y, z: start.z + 400 },
  };
}

export interface MarkupPoint {
  positionX: number;
  positionY: number;
  positionZ: number;
  modelId?: string;
  objectId?: number;
}

/** TextMarkup start/end. Coordinates are millimetres. `type` is omitted: a point pick is not a text leader. */
export function markupEnds(box: Box3, bind?: { modelId: string; objectId: number }): { start: MarkupPoint; end: MarkupPoint } {
  const anchor = labelAnchor(box);
  const point = (value: Vector3): MarkupPoint => {
    const pick: MarkupPoint = {
      positionX: value.x,
      positionY: value.y,
      positionZ: value.z,
    };
    if (bind) {
      pick.modelId = bind.modelId;
      pick.objectId = bind.objectId;
    }
    return pick;
  };
  return { start: point(anchor.start), end: point(anchor.end) };
}

export function placementSummary(box: Box3 | null, realBoxes: number, total: number): string {
  const boxes = `Caixas do visualizador: ${realBoxes} de ${total}.`;
  if (!box) return `${boxes} Sem caixa, a etiqueta fica na origem.`;
  const anchor = labelAnchor(box).start;
  const round = (value: number) => Math.round(value);
  return `${boxes} Escala ×${markupScale(box)}. Exemplo: X ${round(anchor.x)} Y ${round(anchor.y)} Z ${round(anchor.z)} mm.`;
}

export function buildLabelText(object: InquiredObject, items: PropItem[], settings: LabelSettings): string {
  const parts: string[] = [];
  if (settings.showObjectName) parts.push(object.title);
  for (const item of items) {
    const property = findProperty(object.raw, item);
    const value = property ? formatValue(property, settings.showUnits) : "—";
    parts.push(settings.showPropertyName ? `${item.label}: ${value}` : value);
  }
  if (parts.length === 0) return "";
  return settings.layout === "horizontal" ? parts.join(settings.separator) : parts.join("\n");
}
