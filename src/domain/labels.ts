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

/**
 * Markup picks are millimetres. Bounding boxes follow the viewer world, which
 * matches object positions (metres) unless the extent is already in millimetres.
 * A single part longer than 300 m is rare in building works, so an extent above
 * 300 is left unchanged.
 */
export function toMillimeters(box: Box3): Box3 {
  const scale = boxExtent(box) > 300 ? 1 : 1000;
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

export function buildLabelText(object: InquiredObject, items: PropItem[], settings: LabelSettings): string {
  const parts: string[] = [];
  if (settings.showObjectName) parts.push(object.title);
  for (const item of items) {
    const property = findProperty(object.raw, item);
    const value = property ? formatValue(property, settings.showUnits) : "—";
    parts.push(`${item.label}: ${value}`);
  }
  if (parts.length === 0) return "";
  return settings.layout === "horizontal" ? parts.join(settings.separator) : parts.join("\n");
}
