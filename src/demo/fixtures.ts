import { PropertyType, type Box3, type ColumnSet, type RawObject } from "../domain/types";

const T = PropertyType;

export interface DemoPiece {
  runtimeId: number;
  kind: "column" | "beam" | "slab" | "plate" | "rail";
  kicker: string;
  short: string;
  ariaLabel: string;
  left: string;
  top: string;
  width: string;
  height: string;
  side: "left" | "right" | "up" | "down";
}

interface CatalogEntry {
  raw: RawObject;
  box: Box3;
  piece?: DemoPiece;
}

function length(name: string, value: number) {
  return { name, type: T.LengthMeasure, value };
}
function mass(name: string, value: number) {
  return { name, type: T.MassMeasure, value };
}
function area(name: string, value: number) {
  return { name, type: T.AreaMeasure, value };
}
function volume(name: string, value: number) {
  return { name, type: T.VolumeMeasure, value };
}
function text(name: string, value: string) {
  return { name, type: T.StringValue, value };
}

function entry(
  raw: RawObject,
  box: Box3,
  piece?: DemoPiece,
): CatalogEntry {
  return { raw, box, piece };
}

const catalog: CatalogEntry[] = [
  entry(
    {
      id: 1,
      class: "IfcColumn",
      product: { name: "HEB180", objectType: "Pilar" },
      properties: [
        { name: "Identificação", properties: [text("Nome", "Pilar P1"), text("Marca", "P1"), text("Conjunto", "ZSCA10-0"), text("Desenho", "3221.01-ZSCA10")] },
        { name: "Perfil", properties: [text("Nome", "HEB180"), length("Altura", 180), length("Largura", 180)] },
        { name: "Material", properties: [text("Tipo", "Aço"), text("Grau", "S355")] },
        { name: "Quantidades", properties: [length("Comprimento", 3200), mass("Peso", 163.8), area("Área", 1.84)] },
      ],
    },
    { min: { x: 0, y: 0, z: 0 }, max: { x: 0.3, y: 0.3, z: 3.2 } },
    { runtimeId: 1, kind: "column", kicker: "Pilar", short: "P1", ariaLabel: "Pilar P1", left: "7%", top: "22%", width: "8%", height: "18%", side: "up" },
  ),
  entry(
    {
      id: 2,
      class: "IfcBeam",
      product: { name: "HEA200", objectType: "Viga" },
      properties: [
        { name: "Identificação", properties: [text("Nome", "Viga V1"), text("Marca", "V1"), text("Conjunto", "ZSCA11-0"), text("Desenho", "3221.01-ZSCA11")] },
        { name: "Perfil", properties: [text("Nome", "HEA200"), length("Altura", 190), length("Largura", 200)] },
        { name: "Material", properties: [text("Tipo", "Aço"), text("Grau", "S275JR")] },
        { name: "Quantidades", properties: [length("Comprimento", 6000), mass("Peso", 253.8), area("Área", 3.72)] },
      ],
    },
    { min: { x: 0.3, y: 0, z: 2.9 }, max: { x: 6.3, y: 0.2, z: 3.2 } },
    { runtimeId: 2, kind: "beam", kicker: "Viga", short: "V1", ariaLabel: "Viga V1", left: "17%", top: "24%", width: "34%", height: "9%", side: "up" },
  ),
  entry(
    {
      id: 3,
      class: "IfcColumn",
      product: { name: "HEB180", objectType: "Pilar" },
      properties: [
        { name: "Identificação", properties: [text("Nome", "Pilar P2"), text("Marca", "P2"), text("Conjunto", "ZSCA12-0"), text("Desenho", "3221.01-ZSCA12")] },
        { name: "Perfil", properties: [text("Nome", "HEB180"), length("Altura", 180), length("Largura", 180)] },
        { name: "Material", properties: [text("Tipo", "Aço"), text("Grau", "S355")] },
        { name: "Quantidades", properties: [length("Comprimento", 3200), mass("Peso", 163.8), area("Área", 1.84)] },
      ],
    },
    { min: { x: 6.3, y: 0, z: 0 }, max: { x: 6.6, y: 0.3, z: 3.2 } },
    { runtimeId: 3, kind: "column", kicker: "Pilar", short: "P2", ariaLabel: "Pilar P2", left: "52%", top: "22%", width: "8%", height: "18%", side: "right" },
  ),
  entry(
    {
      id: 4,
      class: "IfcBeam",
      product: { name: "HEA200", objectType: "Viga" },
      properties: [
        { name: "Identificação", properties: [text("Nome", "Viga V2"), text("Marca", "V2"), text("Conjunto", "ZSCA13-0"), text("Desenho", "3221.01-ZSCA13")] },
        { name: "Perfil", properties: [text("Nome", "HEA200"), length("Altura", 190), length("Largura", 200)] },
        { name: "Material", properties: [text("Tipo", "Aço"), text("Grau", "S275JR")] },
        { name: "Quantidades", properties: [length("Comprimento", 6000), mass("Peso", 253.8), area("Área", 3.72)] },
      ],
    },
    { min: { x: 0.3, y: 5.8, z: 2.9 }, max: { x: 6.3, y: 6, z: 3.2 } },
    { runtimeId: 4, kind: "beam", kicker: "Viga", short: "V2", ariaLabel: "Viga V2", left: "17%", top: "70%", width: "34%", height: "9%", side: "down" },
  ),
  entry(
    {
      id: 5,
      class: "IfcColumn",
      product: { name: "HEB180", objectType: "Pilar" },
      properties: [
        { name: "Identificação", properties: [text("Nome", "Pilar P3"), text("Marca", "P3"), text("Conjunto", "ZSCA14-0"), text("Desenho", "3221.01-ZSCA14")] },
        { name: "Perfil", properties: [text("Nome", "HEB180"), length("Altura", 180), length("Largura", 180)] },
        { name: "Material", properties: [text("Tipo", "Aço"), text("Grau", "S355")] },
        { name: "Quantidades", properties: [length("Comprimento", 3200), mass("Peso", 163.8), area("Área", 1.84)] },
      ],
    },
    { min: { x: 0, y: 5.7, z: 0 }, max: { x: 0.3, y: 6, z: 3.2 } },
    { runtimeId: 5, kind: "column", kicker: "Pilar", short: "P3", ariaLabel: "Pilar P3", left: "7%", top: "64%", width: "8%", height: "18%", side: "left" },
  ),
  entry(
    {
      id: 6,
      class: "IfcSlab",
      product: { name: "Laje maciça", objectType: "Laje" },
      properties: [
        { name: "Identificação", properties: [text("Nome", "Laje L1"), text("Marca", "L1"), text("Conjunto", "LAJE-L1"), text("Desenho", "Laje")] },
        { name: "Material", properties: [text("Tipo", "Betão"), text("Grau", "C30/37")] },
        {
          name: "Quantidades",
          properties: [length("Espessura", 200), area("Área", 24), volume("Volume", 4.8), mass("Peso", 12000)],
        },
      ],
    },
    { min: { x: 0.5, y: 0.5, z: 3.2 }, max: { x: 6.1, y: 5.5, z: 3.4 } },
    { runtimeId: 6, kind: "slab", kicker: "Laje", short: "L1", ariaLabel: "Laje L1", left: "22%", top: "42%", width: "26%", height: "20%", side: "right" },
  ),
  entry(
    {
      id: 7,
      class: "IfcPlate",
      product: { name: "Chapa 20 mm", objectType: "Chapa" },
      properties: [
        { name: "Identificação", properties: [text("Nome", "Chapa CH1"), text("Marca", "CH1"), text("Conjunto", "ZSCA1-0"), text("Desenho", "3221.01-ZSCA1")] },
        { name: "Perfil", properties: [text("Nome", "PL20"), length("Altura", 20), length("Largura", 400)] },
        { name: "Material", properties: [text("Tipo", "Aço"), text("Grau", "S235")] },
        { name: "Quantidades", properties: [length("Comprimento", 400), mass("Peso", 25.1), area("Área", 0.16)] },
      ],
    },
    { min: { x: 0, y: 0, z: -0.02 }, max: { x: 0.4, y: 0.4, z: 0 } },
    { runtimeId: 7, kind: "plate", kicker: "Chapa", short: "CH1", ariaLabel: "Chapa CH1", left: "7%", top: "46%", width: "8%", height: "10%", side: "left" },
  ),
  entry(
    {
      id: 8,
      class: "IfcRailing",
      product: { name: "Guarda-corpos", objectType: "Guarda" },
      properties: [
        { name: "Identificação", properties: [text("Nome", "Guarda GC1"), text("Marca", "GC1"), text("Conjunto", "ZSCA2-0"), text("Desenho", "3221.01-ZSCA2")] },
        { name: "Perfil", properties: [text("Nome", "Tubo 48.3×3.2"), length("Altura", 1100), length("Largura", 48)] },
        { name: "Material", properties: [text("Tipo", "Aço"), text("Grau", "S235")] },
        { name: "Quantidades", properties: [length("Comprimento", 12000), mass("Peso", 86.4), area("Área", 2.1)] },
      ],
    },
    { min: { x: 6.8, y: 0, z: 0 }, max: { x: 7, y: 6, z: 1.1 } },
    { runtimeId: 8, kind: "rail", kicker: "Guarda", short: "GC1", ariaLabel: "Guarda GC1", left: "78%", top: "22%", width: "7%", height: "56%", side: "left" },
  ),
];

for (let index = 1; index <= 17; index += 1) {
  const id = 100 + index;
  catalog.push(entry(
    {
      id,
      class: "IfcDiscreteAccessory",
      properties: [
        { name: "Identificação", properties: [text("Nome", `Peça extra ${String(index).padStart(2, "0")}`)] },
        { name: "Perfil", properties: [text("Nome", "L50x50x5"), length("Altura", 50), length("Largura", 50)] },
        { name: "Material", properties: [text("Tipo", "Aço"), text("Grau", "S235")] },
        { name: "Quantidades", properties: [length("Comprimento", 800 + index * 15), mass("Peso", Number((3.1 + index * 0.15).toFixed(2)))] },
      ],
    },
    { min: { x: index, y: 8, z: 0 }, max: { x: index + 0.8, y: 8.05, z: 0.05 } },
  ));
}

export const DEMO_MODEL_ID = "modelo-demonstracao";

export const DEMO_COLUMN_SETS: ColumnSet[] = [
  {
    name: "Aprovisionamento",
    columns: [
      { field: "Identificação.Nome", label: "Nome" },
      { field: "Perfil.Nome", label: "Perfil" },
      { field: "Material.Tipo", label: "Tipo de material" },
      { field: "Material.Grau", label: "Grau do material" },
      { field: "Quantidades.Comprimento", label: "Comprimento" },
      { field: "Quantidades.Peso", label: "Peso" },
    ],
  },
  {
    name: "Geometria",
    columns: [
      { field: "Perfil.Nome", label: "Perfil" },
      { field: "Perfil.Altura", label: "Altura" },
      { field: "Perfil.Largura", label: "Largura" },
      { field: "Quantidades.Comprimento", label: "Comprimento" },
      { field: "Quantidades.Área", label: "Área" },
      { field: "Quantidades.Volume", label: "Volume" },
    ],
  },
];

export function demoCatalog(): CatalogEntry[] {
  return catalog;
}

export function demoPieces(): DemoPiece[] {
  return catalog.flatMap((item) => (item.piece ? [item.piece] : []));
}

export function findDemoEntry(runtimeId: number): CatalogEntry | undefined {
  return catalog.find((item) => item.raw.id === runtimeId);
}
