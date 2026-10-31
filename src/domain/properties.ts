import { formatValue, normalizeSearch, unitFor } from "./format";
import {
  MAX_OBJECTS,
  type Box3,
  type ColumnDef,
  type ColumnSet,
  type InquiredObject,
  type PropItem,
  type Property,
  type RawObject,
  type SelectionGroup,
  type SelectionRef,
  type Vector3,
} from "./types";

const NAME_PROPS = new Set(["nome", "name", "marca", "mark", "tag"]);
const PREFERRED_SETS = new Set(["identificação", "identificacao", "identity", "ifcroot"]);

export function propertyKey(setName: string, name: string): string {
  return `${setName}||${name}`;
}

export function parseField(field: string): { setName: string; name: string } {
  const parts = field.split(/[/.:]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { setName: parts.slice(0, -1).join("."), name: parts[parts.length - 1] };
  }
  return { setName: "", name: field.trim() };
}

export function columnsToItems(columns: ColumnDef[]): PropItem[] {
  return columns.map((column) => {
    const parsed = parseField(column.field);
    const fallback = parsed.setName ? `${parsed.setName} / ${parsed.name}` : parsed.name;
    return {
      key: propertyKey(parsed.setName, parsed.name),
      setName: parsed.setName,
      name: parsed.name,
      label: column.label?.trim() || fallback,
      field: column.field,
    };
  });
}

export function discoverItems(objects: InquiredObject[]): PropItem[] {
  const map = new Map<string, PropItem>();
  for (const object of objects) {
    for (const set of object.raw.properties ?? []) {
      const setName = set.name ?? "";
      for (const property of set.properties ?? []) {
        const key = propertyKey(setName, property.name);
        if (map.has(key)) continue;
        map.set(key, {
          key,
          setName,
          name: property.name,
          label: property.name,
          field: setName ? `${setName}.${property.name}` : property.name,
        });
      }
    }
  }
  return [...map.values()];
}

export function sortItems(items: PropItem[], direction: "asc" | "desc"): PropItem[] {
  const sorted = [...items].sort((a, b) => a.label.localeCompare(b.label, "pt-PT", { sensitivity: "base" })
    || a.key.localeCompare(b.key, "pt-PT"));
  return direction === "desc" ? sorted.reverse() : sorted;
}

export function findProperty(raw: RawObject, item: PropItem): Property | undefined {
  const sets = raw.properties ?? [];
  for (const set of sets) {
    const setName = set.name ?? "";
    for (const property of set.properties ?? []) {
      if (propertyKey(setName, property.name) === item.key) return property;
    }
  }
  if (!item.setName) {
    const matches: Property[] = [];
    for (const set of sets) {
      for (const property of set.properties ?? []) {
        if (property.name.toLowerCase() === item.name.toLowerCase()) matches.push(property);
      }
    }
    if (matches.length === 1) return matches[0];
  }
  return undefined;
}

function namedValue(raw: RawObject, setFilter?: (setName: string) => boolean): string | undefined {
  for (const set of raw.properties ?? []) {
    const setName = (set.name ?? "").toLowerCase();
    if (setFilter && !setFilter(setName)) continue;
    for (const property of set.properties ?? []) {
      if (!NAME_PROPS.has(property.name.toLowerCase())) continue;
      if (property.value === null || property.value === undefined) continue;
      const text = String(property.value).trim();
      if (text) return text;
    }
  }
  return undefined;
}

export function objectTitle(raw: RawObject): string {
  return namedValue(raw, (setName) => PREFERRED_SETS.has(setName))
    || namedValue(raw)
    || raw.product?.name
    || (raw.class ? `${raw.class} ${raw.id}` : `#${raw.id}`);
}

export function toInquiredObject(modelId: string, raw: RawObject, box: Box3 | null): InquiredObject {
  return {
    modelId,
    runtimeId: raw.id,
    title: objectTitle(raw),
    className: raw.class ?? "",
    raw,
    box,
  };
}

export function flattenSelection(groups: SelectionGroup[] | null | undefined): SelectionRef[] {
  const refs: SelectionRef[] = [];
  for (const group of groups ?? []) {
    for (const runtimeId of group.objectRuntimeIds ?? []) {
      refs.push({ modelId: group.modelId, runtimeId });
    }
  }
  return refs;
}

export function capSelection<T>(items: T[], max = MAX_OBJECTS): { kept: T[]; total: number; truncated: boolean } {
  return {
    kept: items.slice(0, max),
    total: items.length,
    truncated: items.length > max,
  };
}

export function itemsForTable(items: PropItem[], checked: ReadonlySet<string>): PropItem[] {
  const selected = items.filter((item) => checked.has(item.key));
  return selected.length > 0 ? selected : items;
}

export function filterItems(items: PropItem[], objects: InquiredObject[], query: string, showUnits: boolean): PropItem[] {
  const needle = normalizeSearch(query);
  if (!needle) return items;
  return items.filter((item) => {
    const haystack = [item.label, item.setName, item.name, item.field ?? ""];
    for (const object of objects) {
      const property = findProperty(object.raw, item);
      haystack.push(property ? formatValue(property, showUnits) : "");
    }
    return haystack.some((part) => normalizeSearch(part).includes(needle));
  });
}

export function columnHeader(item: PropItem, objects: InquiredObject[], showUnits: boolean): string {
  if (!showUnits) return item.label;
  for (const object of objects) {
    const property = findProperty(object.raw, item);
    if (!property) continue;
    const unit = unitFor(property.type);
    if (unit) return `${item.label} (${unit})`;
  }
  return item.label;
}

export function activeColumnSet(sets: ColumnSet[], activeName: string | null): ColumnSet | undefined {
  if (!activeName) return undefined;
  return sets.find((set) => set.name === activeName);
}

export function sameKeys(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((key) => rightSet.has(key));
}

export function boxFromPosition(position: Vector3): Box3 {
  return {
    min: { x: position.x - 0.15, y: position.y - 0.15, z: position.z },
    max: { x: position.x + 0.15, y: position.y + 0.15, z: position.z + 0.3 },
  };
}
