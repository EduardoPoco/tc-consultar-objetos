import { connect } from "trimble-connect-workspace-api";
import { hexToRgba } from "../domain/color";
import { labelAnchor } from "../domain/labels";
import { boxFromPosition, flattenSelection, toInquiredObject } from "../domain/properties";
import { PROPERTY_BATCH, type Box3, type LabelPayload, type SelectionGroup, type TextLabel, type Vector3 } from "../domain/types";
import type { ColumnSetResult, HostSnapshot, ViewerHost } from "./types";

interface WorkspaceLike {
  dataTable?: {
    getColumnSets: () => Promise<Array<{ name: string; columns: Array<{ field: string; label?: string }> }>>;
    getConfig: () => Promise<{ columnSet?: { name?: string } }>;
  };
  project?: {
    getProject: () => Promise<{ id?: string }>;
  };
  viewer: {
    getSelection: () => Promise<SelectionGroup[]>;
    getObjects: () => Promise<Array<{ modelId: string; objects?: Array<{ id: number }> }>>;
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
  objectColors: {},
  loading: false,
  loadedCount: 0,
  cancelled: false,
  selectionId: 0,
  error: "",
  connectionFailed: false,
});

export async function createTrimbleHost(): Promise<ViewerHost> {
  const listeners = new Set<() => void>();
  let ticket = 0;
  let selectionId = 0;
  let cancelFlag = false;
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
      snapshot = { ...snapshot, labels: [], isolated: false, isolatedRuntimeIds: [], highlightColor: null, objectColors: {} };
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
    cancelFlag = false;
    const refs = flattenSelection(groups);
    const id = ++selectionId;
    const collected: ReturnType<typeof toInquiredObject>[] = [];
    snapshot = {
      ...snapshot,
      loading: refs.length > 0,
      loadedCount: 0,
      totalSelected: refs.length,
      objects: [],
      cancelled: false,
      selectionId: id,
      error: "",
    };
    notify();
    if (refs.length === 0) return;
    try {
      const outcome = await loadObjects(api, refs, (loaded, objects) => {
        if (mine !== ticket) return;
        snapshot = { ...snapshot, loading: true, loadedCount: loaded, objects };
        notify();
      }, () => mine !== ticket || cancelFlag);
      if (mine !== ticket) return;
      labels = labels.filter((label) => outcome.objects.some((object) => object.modelId === label.modelId && object.runtimeId === label.runtimeId));
      snapshot = {
        ...snapshot,
        loading: false,
        cancelled: outcome.cancelled,
        objects: outcome.objects,
        loadedCount: outcome.objects.length,
        labels,
        error: "",
      };
    } catch (error) {
      if (mine !== ticket) return;
      const message = error instanceof Error ? error.message : "Não foi possível ler as propriedades.";
      snapshot = { ...snapshot, loading: false, objects: collected, error: message };
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
    cancelLoad() {
      cancelFlag = true;
    },
    async showLabels(payloads) {
      payloads = await attachBoxes(api, payloads);
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
        objectColors: {},
        error: "",
      };
      notify();
    },
    async resetAppearance() {
      await api.viewer.setObjectState(undefined, { visible: "reset", color: "reset" });
      snapshot = { ...snapshot, isolated: false, isolatedRuntimeIds: [], highlightColor: null, objectColors: {}, error: "" };
      notify();
    },
    async colorByObject(entries) {
      await api.viewer.setObjectState(undefined, { color: "reset" });
      const byColor = new Map<string, Array<{ modelId: string; runtimeId: number }>>();
      for (const entry of entries) {
        const list = byColor.get(entry.color) ?? [];
        list.push(entry);
        byColor.set(entry.color, list);
      }
      for (const [color, colored] of byColor) {
        const byModel = new Map<string, number[]>();
        for (const entry of colored) {
          const ids = byModel.get(entry.modelId) ?? [];
          ids.push(entry.runtimeId);
          byModel.set(entry.modelId, ids);
        }
        await api.viewer.setObjectState(
          { modelObjectIds: [...byModel].map(([modelId, objectRuntimeIds]) => ({ modelId, objectRuntimeIds })) },
          { color: hexToRgba(color) },
        );
      }
      const objectColors: Record<string, string> = {};
      for (const entry of entries) objectColors[`${entry.modelId}:${entry.runtimeId}`] = entry.color;
      snapshot = { ...snapshot, objectColors, isolated: false, isolatedRuntimeIds: [], highlightColor: null, error: "" };
      notify();
    },
    async projectId() {
      try {
        const project = await api.project?.getProject();
        return project?.id || "projeto";
      } catch {
        return "projeto";
      }
    },
    async listAllObjects() {
      const listed = await api.viewer.getObjects();
      const objects = [];
      for (const model of listed ?? []) {
        const ids = (model.objects ?? []).map((object) => object.id).filter((id) => Number.isFinite(id));
        for (let start = 0; start < ids.length; start += PROPERTY_BATCH) {
          const chunk = ids.slice(start, start + PROPERTY_BATCH);
          const properties = await api.viewer.getObjectProperties(model.modelId, chunk);
          for (const raw of properties) objects.push(toInquiredObject(model.modelId, raw, null));
        }
      }
      return objects;
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
  onBatch: (loaded: number, objects: ReturnType<typeof toInquiredObject>[]) => void,
  shouldStop: () => boolean,
): Promise<{ objects: ReturnType<typeof toInquiredObject>[]; cancelled: boolean }> {
  const byModel = new Map<string, number[]>();
  for (const ref of refs) {
    const ids = byModel.get(ref.modelId) ?? [];
    ids.push(ref.runtimeId);
    byModel.set(ref.modelId, ids);
  }
  const objects: ReturnType<typeof toInquiredObject>[] = [];
  let loaded = 0;
  for (const [modelId, ids] of byModel) {
    for (let start = 0; start < ids.length; start += PROPERTY_BATCH) {
      if (shouldStop()) return { objects, cancelled: true };
      const chunk = ids.slice(start, start + PROPERTY_BATCH);
      const properties = await api.viewer.getObjectProperties(modelId, chunk);
      const byId = new Map(properties.map((raw) => [raw.id, raw]));
      for (const runtimeId of chunk) {
        const raw = byId.get(runtimeId) ?? { id: runtimeId };
        const box = raw.position ? boxFromPosition(raw.position) : null;
        objects.push(toInquiredObject(modelId, raw, box));
      }
      loaded += chunk.length;
      onBatch(loaded, objects.slice());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return { objects, cancelled: false };
}

async function attachBoxes(api: WorkspaceLike, payloads: LabelPayload[]): Promise<LabelPayload[]> {
  const missing = payloads.filter((payload) => !payload.box);
  if (missing.length === 0) return payloads;
  const boxes = new Map<string, Box3>();
  const byModel = new Map<string, number[]>();
  for (const payload of missing) {
    const ids = byModel.get(payload.modelId) ?? [];
    ids.push(payload.runtimeId);
    byModel.set(payload.modelId, ids);
  }
  for (const [modelId, ids] of byModel) {
    try {
      const found = await api.viewer.getObjectBoundingBoxes(modelId, ids);
      for (const box of found) boxes.set(`${modelId}:${box.id}`, box.boundingBox);
    } catch {
      // Labels still use the object position when the box is unavailable.
    }
  }
  return payloads.map((payload) => ({
    ...payload,
    box: payload.box ?? boxes.get(`${payload.modelId}:${payload.runtimeId}`) ?? null,
  }));
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
    projectId: async () => "desligado",
    listAllObjects: async () => [],
    colorByObject: async () => undefined,
    cancelLoad: () => undefined,
  };
}
