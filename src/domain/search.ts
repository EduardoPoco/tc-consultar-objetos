import { formatValue } from "./format";
import { findProperty } from "./properties";
import type { InquiredObject, PropItem } from "./types";

export type SearchMode = "equal" | "contains";

export function normalizeMatch(value: string): string {
  return value.trim().toLocaleLowerCase("pt-PT");
}

export function textMatches(candidate: string, query: string, mode: SearchMode): boolean {
  const needle = normalizeMatch(query);
  if (!needle) return false;
  const haystack = normalizeMatch(candidate);
  return mode === "contains" ? haystack.includes(needle) : haystack === needle;
}

export function objectMatches(object: InquiredObject, item: PropItem, query: string, mode: SearchMode): boolean {
  const property = findProperty(object.raw, item);
  if (!property || property.value == null || property.value === "") return false;
  const candidates = [formatValue(property, false), formatValue(property, true), String(property.value)];
  return candidates.some((candidate) => textMatches(candidate, query, mode));
}

export function searchObjects(
  objects: InquiredObject[],
  item: PropItem,
  query: string,
  mode: SearchMode,
): InquiredObject[] {
  return objects.filter((object) => objectMatches(object, item, query, mode));
}
