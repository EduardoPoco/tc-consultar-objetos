import { connect } from "trimble-connect-workspace-api";
import { hexToRgba } from "../domain/color";
import { labelAnchor } from "../domain/labels";
import { boxFromPosition, capSelection, flattenSelection, toInquiredObject } from "../domain/properties";
import type { Box3, LabelPayload, SelectionGroup, TextLabel, Vector3 } from "../domain/types";
import type { ColumnSetResult, HostSnapshot, ViewerHost } from "./types";

interface WorkspaceLike {
  dataTable?: {
    getColumnSets: () => Promise<Array<{ name: string; columns: Array<{ field: string; label?: string }> }>>;
    getConfig: () => Promise<{ columnSet?: { name?: string } }>;
  };
  viewer: {
    getSelection: () => Promise<SelectionGroup[]>;
    getObjectProperties: (modelId: string, objectRuntimeIds: number[]) => Promise<Array<{
      id: number;
      class?: string;
      product?: { name?: string; description?: string; objectType?: string };
      properties?: Array<{ name?: string; properties?: Array<{ name: string; value: string | number; type: number }> }>;
      position?: Vector3;
    }>>;
    getObjectBoundingBoxes: (modelId: string, objectRuntimeIds: number[]) => Promise<Array<{ id: number; boundingBox: Box3 }>>;
    isolateEntities: (entities: Array<{ modelId: string; entityIds: number[] }>) => Promise<boolean>;
    setObjectState: (
      selector: { modelObjectIds: Array<{ modelId: string; objectRuntimeIds: number[] }> } | undefined,
      objectState: { visible?: boolean | "reset"; color?: { r: number; g: number; b: number; a: number } | "reset" },
    ) => Promise<void>;
  };
  markup: {
    addTextMarkup: (markups: Array<{
      text?: string;
      color?: { r: number; g: number; b: number; a: number };
      start: MarkupPick;
      end: MarkupPick;
    }>) => Promise<Array<{ id?: number; text?: string }>>;
    removeMarkups: (ids: number[] | undefined) => Promise<void>;
  };
}

interface MarkupPick {
  positionX: number;
  positionY: number;
  positionZ: number;
  modelId?: string;
  objectId?: number;
  type?: "point";
}

interface SelectionEvent {
  origin?: { isSelf?: boolean };
  data?: SelectionGroup[];
}

const emptySnapshot = (): HostSnapshot => ({
  objects: [],
  totalSelected: 0,
  labels: [],
  isolated: false,
  isolatedRuntimeIds: [],
  highlightColor: null,
  loading: false,
  error: "",
  connectionFailed: false,
});

export async function createTrimbleHost(): Promise<ViewerHost> {
  const listeners = new Set<() => void>();
  let ticket = 0;
  let labelIds: number[] = [];
  let labels: TextLabel[] = [];
  let snapshot = { ...emptySnapshot(), loading: true };

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const onEvent = (event: string, data: unknown) => {
    if (event === "viewer.onModelReset") {
      labelIds = [];
      labels = [];
      snapshot = { ...snapshot, labels: [], isolated: false, isolatedRuntimeIds: [], highlightColor: null };
      notify();
      return;
    }
    if (event !== "viewer.onSelectionChanged") return;
    const payload = data as SelectionEvent;
    if (payload?.origin?.isSelf) return;
    void applySelection(payload?.data ?? []);
  };
  const api = await connect(
    window.parent,
    onEvent as Parameters<typeof connect>[1],
    10000,
  ) as unknown as WorkspaceLike;

  async function applySelection(groups: SelectionGroup[]): Promise<void> {
    const mine = ++ticket;
    const capped = capSelection(flattenSelection(groups));
    snapshot = { ...snapshot, loading: true, error: "", totalSelected: capped.total };
    notify();
    try {
      const objects = await loadObjects(api, capped.kept);
      if (mine !== ticket) return;
      labels = labels.filter((label) => objects.some((object) => object.modelId === label.modelId && object.runtimeId === label.runtimeId));
      snapshot = { ...snapshot, loading: false, objects, totalSelected: capped.total, labels, error: "" };
    } catch (error) {
      if (mine !== ticket) return;
      const message = error instanceof Error ? error.message : "Não foi possível ler as propriedades.";
      snapshot = { ...snapshot, loading: false, objects: [], error: message };
    }
    notify();
  }

  try {
    const current = await api.viewer.getSelection();
    await applySelection(current);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ler a seleção.";
    snapshot = { ...snapshot, loading: false, error: message };
    notify();
  }

  return {
    mode: "trimble",
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => snapshot,
    loadColumnSets,
    async showLabels(payloads) {
      if (labelIds.length > 0) {
        try {
          await api.markup.removeMarkups(labelIds);
        } catch {
          // The previous ids may already be gone after a view change.
        }
        labelIds = [];
      }
      if (payloads.length === 0) {
        labels = [];
        snapshot = { ...snapshot, labels };
        notify();
        return;
      }
      const created = await api.markup.addTextMarkup(payloads.map(toMarkup));
      labelIds = created.flatMap((markup) => (typeof markup.id === "number" ? [markup.id] : []));
      labels = payloads.map((payload, index) => ({
        id: labelIds[index] ?? index + 1,
        modelId: payload.modelId,
        runtimeId: payload.runtimeId,
        text: payload.text,
        color: payload.color,
      }));
      snapshot = { ...snapshot, labels, error: "" };
      notify();
    },
    async clearLabels() {
      if (labelIds.length > 0) await api.markup.removeMarkups(labelIds);
      labelIds = [];
      labels = [];
      snapshot = { ...snapshot, labels };
      notify();
    },
    async isolate(objects, color) {
      const groups = groupIds(objects);
      await api.viewer.isolateEntities(groups.map(([modelId, entityIds]) => ({ modelId, entityIds })));
      await api.viewer.setObjectState(
        { modelObjectIds: groups.map(([modelId, objectRuntimeIds]) => ({ modelId, objectRuntimeIds })) },
        { color: hexToRgba(color) },
      );
      snapshot = {
        ...snapshot,
        isolated: objects.length > 0,
        isolatedRuntimeIds: objects.map((object) => object.runtimeId),
        highlightColor: color,
        error: "",
      };
      notify();
    },
    async resetAppearance() {
      await api.viewer.setObjectState(undefined, { visible: "reset", color: "reset" });
      snapshot = { ...snapshot, isolated: false, isolatedRuntimeIds: [], highlightColor: null, error: "" };
      notify();
    },
  };

  async function loadColumnSets(): Promise<ColumnSetResult | null> {
    try {
      if (!api.dataTable) return null;
      const [sets, config] = await Promise.all([api.dataTable.getColumnSets(), api.dataTable.getConfig()]);
      return {
        sets: sets.map((set) => ({
          name: set.name,
          columns: (set.columns ?? []).map((column) => ({ field: column.field, label: column.label })),
        })),
        activeName: config.columnSet?.name ?? null,
      };
    } catch {
      return null;
    }
  }
}

async function loadObjects(
  api: WorkspaceLike,
  refs: Array<{ modelId: string; runtimeId: number }>,
) {
  const byModel = new Map<string, number[]>();
  for (const ref of refs) {
    const ids = byModel.get(ref.modelId) ?? [];
    ids.push(ref.runtimeId);
    byModel.set(ref.modelId, ids);
  }
  const found = new Map<string, ReturnType<typeof toInquiredObject>>();
  for (const [modelId, ids] of byModel) {
    const properties = await api.viewer.getObjectProperties(modelId, ids);
    let boxes: Array<{ id: number; boundingBox: Box3 }> = [];
    try {
      boxes = await api.viewer.getObjectBoundingBoxes(modelId, ids);
    } catch {
      boxes = [];
    }
    const boxById = new Map(boxes.map((box) => [box.id, box.boundingBox]));
    for (const raw of properties) {
      const box = boxById.get(raw.id) ?? (raw.position ? boxFromPosition(raw.position) : null);
      found.set(`${modelId}:${raw.id}`, toInquiredObject(modelId, raw, box));
    }
  }
  return refs.map((ref) => found.get(`${ref.modelId}:${ref.runtimeId}`) ?? toInquiredObject(ref.modelId, { id: ref.runtimeId }, null));
}

function groupIds(objects: Array<{ modelId: string; runtimeId: number }>): Array<[string, number[]]> {
  const groups = new Map<string, number[]>();
  for (const object of objects) {
    const ids = groups.get(object.modelId) ?? [];
    ids.push(object.runtimeId);
    groups.set(object.modelId, ids);
  }
  return [...groups];
}

function toMarkup(payload: LabelPayload) {
  const box = payload.box ?? (payload.position ? boxFromPosition(payload.position) : {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 0.2, y: 0.2, z: 0.2 },
  });
  const anchor = labelAnchor(box);
  const pick = (point: Vector3): MarkupPick => ({
    positionX: point.x,
    positionY: point.y,
    positionZ: point.z,
    modelId: payload.modelId,
    objectId: payload.runtimeId,
    type: "point",
  });
  return {
    text: payload.text,
    color: hexToRgba(payload.color),
    start: pick(anchor.start),
    end: pick(anchor.end),
  };
}

export function connectionFailureHost(message: string): ViewerHost {
  const snapshot: HostSnapshot = { ...emptySnapshot(), error: message, connectionFailed: true };
  return {
    mode: "trimble",
    subscribe: () => () => undefined,
    snapshot: () => snapshot,
    loadColumnSets: async () => null,
    showLabels: async () => undefined,
    clearLabels: async () => undefined,
    isolate: async () => undefined,
    resetAppearance: async () => undefined,
  };
}
