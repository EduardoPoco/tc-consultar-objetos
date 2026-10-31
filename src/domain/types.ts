/** Numeric property types from the Trimble Connect Workspace API. */
export const PropertyType = {
  LengthMeasure: 0,
  AreaMeasure: 1,
  VolumeMeasure: 2,
  MassMeasure: 3,
  AngleMeasure: 4,
  StringValue: 5,
  IntValue: 6,
  DoubleValue: 7,
  DateTime: 8,
  Logical: 9,
  Boolean: 10,
} as const;

export type PropertyTypeId = (typeof PropertyType)[keyof typeof PropertyType];

export interface Property {
  name: string;
  value: string | number | boolean | null | undefined;
  type: number;
}

export interface PropertySet {
  name?: string;
  properties?: Property[];
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Box3 {
  min: Vector3;
  max: Vector3;
}

export interface Product {
  name?: string;
  description?: string;
  objectType?: string;
  guid?: string;
}

/** Shape returned by viewer.getObjectProperties. */
export interface RawObject {
  id: number;
  class?: string;
  product?: Product;
  properties?: PropertySet[];
  position?: Vector3;
}

export interface InquiredObject {
  modelId: string;
  runtimeId: number;
  title: string;
  className: string;
  raw: RawObject;
  box: Box3 | null;
}

export interface PropItem {
  key: string;
  setName: string;
  name: string;
  label: string;
  field?: string;
}

export interface ColumnDef {
  field: string;
  label?: string;
}

export interface ColumnSet {
  name: string;
  columns: ColumnDef[];
}

export interface LabelSettings {
  labelColor: string;
  highlightColor: string;
  separator: string;
  layout: "horizontal" | "vertical";
  showUnits: boolean;
  showPropertyName: boolean;
  showObjectName: boolean;
}

export interface NamedPropertySet {
  id: string;
  name: string;
  keys: string[];
}

export interface LabelPayload {
  modelId: string;
  runtimeId: number;
  text: string;
  color: string;
  box: Box3 | null;
  position?: Vector3;
}

export interface TextLabel {
  id: number;
  modelId: string;
  runtimeId: number;
  text: string;
  color: string;
}

export interface SelectionGroup {
  modelId: string;
  objectRuntimeIds?: number[];
}

export interface SelectionRef {
  modelId: string;
  runtimeId: number;
}

export const MAX_OBJECTS = 20;
export const PROPERTY_BATCH = 80;
export const TABLE_PAGE_SIZE = 100;

export const STORAGE_KEYS = {
  sets: "tc-consultar-objetos:conjuntos",
  settings: "tc-consultar-objetos:definicoes",
  columnSet: "tc-consultar-objetos:conjunto-colunas",
} as const;

export const DEFAULT_SETTINGS: LabelSettings = {
  labelColor: "#ffe14a",
  highlightColor: "#e07a1f",
  separator: " | ",
  layout: "vertical",
  showUnits: true,
  showPropertyName: false,
  showObjectName: false,
};

export const EXAMPLE_SET: NamedPropertySet = {
  id: "aco-perfil-material-peso",
  name: "Aço: perfil, material, peso",
  keys: ["Perfil||Nome", "Material||Grau", "Quantidades||Peso"],
};

export const APP_VERSION = "1.2.1";
