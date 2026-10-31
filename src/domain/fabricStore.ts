import type { FabricationDataset, SavedMapping } from "./fabric";

const MAPPING_KEY = "tc-consultar-objetos:mapeamentos";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function datasetKey(projectId: string): string {
  return `tc-consultar-objetos:fabrico:${projectId}`;
}

export function loadMappings(store: KeyValueStore): SavedMapping[] {
  const raw = store.getItem(MAPPING_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMapping);
  } catch {
    return [];
  }
}

export function saveMappings(store: KeyValueStore, mappings: SavedMapping[]): void {
  store.setItem(MAPPING_KEY, JSON.stringify(mappings));
}

export function loadDataset(store: KeyValueStore, projectId: string): FabricationDataset | null {
  const raw = store.getItem(datasetKey(projectId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const dataset = parsed as FabricationDataset;
    if (!Array.isArray(dataset.records) || !dataset.keyProperty) return null;
    return dataset;
  } catch {
    return null;
  }
}

export function saveDataset(store: KeyValueStore, dataset: FabricationDataset): void {
  store.setItem(datasetKey(dataset.projectId), JSON.stringify(dataset));
}

export function clearDataset(store: KeyValueStore, projectId: string): void {
  store.removeItem(datasetKey(projectId));
}

function isMapping(value: unknown): value is SavedMapping {
  if (!value || typeof value !== "object") return false;
  const mapping = value as SavedMapping;
  return typeof mapping.id === "string"
    && typeof mapping.name === "string"
    && typeof mapping.keyColumnName === "string"
    && Array.isArray(mapping.columns);
}
