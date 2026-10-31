import {
  DEFAULT_SETTINGS,
  EXAMPLE_SET,
  STORAGE_KEYS,
  type LabelSettings,
  type NamedPropertySet,
} from "./types";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isSet(value: unknown): value is NamedPropertySet {
  if (!value || typeof value !== "object") return false;
  const set = value as NamedPropertySet;
  return typeof set.id === "string"
    && typeof set.name === "string"
    && Array.isArray(set.keys)
    && set.keys.every((key) => typeof key === "string");
}

export function loadSets(store: KeyValueStore): NamedPropertySet[] {
  const raw = store.getItem(STORAGE_KEYS.sets);
  if (raw == null) {
    const seeded = [{ ...EXAMPLE_SET, keys: [...EXAMPLE_SET.keys] }];
    store.setItem(STORAGE_KEYS.sets, JSON.stringify(seeded));
    return seeded;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSet).map((set) => ({ ...set, keys: [...set.keys] }));
  } catch {
    return [];
  }
}

export function saveSets(store: KeyValueStore, sets: NamedPropertySet[]): void {
  store.setItem(STORAGE_KEYS.sets, JSON.stringify(sets));
}

export function upsertSet(sets: NamedPropertySet[], name: string, keys: string[]): NamedPropertySet[] {
  const trimmed = name.trim();
  const existing = sets.find((set) => set.name === trimmed);
  if (existing) {
    return sets.map((set) => (set.id === existing.id ? { ...set, keys: [...keys] } : set));
  }
  const id = globalThis.crypto?.randomUUID?.() ?? `conjunto-${Date.now()}`;
  return [...sets, { id, name: trimmed, keys: [...keys] }];
}

export function loadSettings(store: KeyValueStore): LabelSettings {
  const raw = store.getItem(STORAGE_KEYS.settings);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SETTINGS };
    const value = parsed as Partial<LabelSettings>;
    const layout = value.layout === "horizontal" || value.layout === "vertical" ? value.layout : DEFAULT_SETTINGS.layout;
    return {
      labelColor: typeof value.labelColor === "string" ? value.labelColor : DEFAULT_SETTINGS.labelColor,
      highlightColor: typeof value.highlightColor === "string" ? value.highlightColor : DEFAULT_SETTINGS.highlightColor,
      separator: typeof value.separator === "string" ? value.separator : DEFAULT_SETTINGS.separator,
      layout,
      showUnits: typeof value.showUnits === "boolean" ? value.showUnits : DEFAULT_SETTINGS.showUnits,
      showObjectName: typeof value.showObjectName === "boolean" ? value.showObjectName : DEFAULT_SETTINGS.showObjectName,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(store: KeyValueStore, settings: LabelSettings): void {
  store.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}
