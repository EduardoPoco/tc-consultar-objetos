import { connect } from "trimble-connect-workspace-api";
import { hexToRgba } from "../domain/color";
import { markupEnds, placementSummary } from "../domain/labels";
import { boxFromPosition, flattenSelection, toInquiredObject } from "../domain/properties";
import { PROPERTY_BATCH, type Box3, type LabelPayload, type SelectionGroup, type TextLabel, type Vector3 } from "../domain/types";
import { noteMarkup } from "./diagnostics";
import { placeTextMarkups, removeMarkupBatches } from "./labelBatches";
import { createSelectionGate } from "./selectionGate";
import type { WorkspaceConnection } from "./workspaceConnection";
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
    setSelection: (selector: { modelObjectIds: Array<{ modelId: string; objectRuntimeIds: number[] }> }, mode: "set" | "add" | "remove") => Promise<void>;
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
    getTextMarkups: () => Promise<Array<{ id?: number; text?: string }>>;
    removeMarkups: (ids: number[] | undefined) => Promise<void>;
  };
}

interface MarkupPick {
  positionX: number;
  positionY: number;
  positionZ: number;
  modelId?: string;
  objectId?: number;
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
  labeling: false,
  labelsPlaced: 0,
  labelsTotal: 0,
  labelsCancelled: false,
  selectionId: 0,
  error: "",
  connectionFailed: false,
});

export async function createTrimbleHost(connection?: WorkspaceConnection): Promise<ViewerHost> {
  const listeners = new Set<() => void>();
  let ticket = 0;
  let selectionId = 0;
  let cancelFlag = false;
  let labelJob = 0;
  let activeLabelJob = 0;
  let labelCancel = false;
  let labelingActive = false;
  let labelIds: number[] = [];
  let labels: TextLabel[] = [];
  let snapshot = { ...emptySnapshot(), loading: true };
  const catalogCache = new Map<string, Map<number, ReturnType<typeof toInquiredObject>>>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const gate = createSelectionGate((groups) => {
    void applySelection(groups);
  });

  const onEvent = (event: string, data: unknown) => {
    if (event === "viewer.onModelReset") {
      labelIds = [];
      labels = [];
      snapshot = { ...snapshot, labels: [], isolated: false, isolatedRuntimeIds: [], highlightColor: null, objectColors: {} };
      notify();
      return;
    }
    if (event !== "viewer.onSelectionChanged") return;
    const parsed = selectionFromEvent(data);
    // Ignore echoes of our own viewer calls. A repeated selection is also dropped by the gate.
    if (parsed.self) return;
    gate.push(parsed.groups);
  };
  const api = connection
    ? connection.api as unknown as WorkspaceLike
    : await connect(window.parent, onEvent as Parameters<typeof connect>[1], 10000) as unknown as WorkspaceLike;
  if (connection) connection.subscribe(onEvent);

  async function applySelection(groups: SelectionGroup[]): Promise<void> {
    const mine = ++ticket;
    labelJob += 1;
    labelCancel = false;
    cancelFlag = false;
    const refs = flattenSelection(groups);
    snapshot = {
      ...snapshot,
      loading: refs.length > 0,
      loadedCount: 0,
      totalSelected: refs.length,
      cancelled: false,
      labeling: false,
      labelsCancelled: false,
      error: "",
    };
    notify();
    if (refs.length === 0) {
      if (mine !== ticket) return;
      labels = [];
      selectionId += 1;
      snapshot = {
        ...snapshot,
        loading: false,
        objects: [],
        labels: [],
        loadedCount: 0,
        totalSelected: 0,
        selectionId,
      };
      notify();
      return;
    }
    try {
      const outcome = await loadObjects(api, refs, (loaded) => {
        if (mine !== ticket) return;
        snapshot = { ...snapshot, loading: true, loadedCount: loaded, totalSelected: refs.length };
        notify();
      }, () => mine !== ticket || cancelFlag);
      if (mine !== ticket) return;
      const objects = outcome.cancelled && outcome.objects.length === 0 ? snapshot.objects : outcome.objects;
      labels = labels.filter((label) => objects.some((object) => object.modelId === label.modelId && object.runtimeId === label.runtimeId));
      selectionId += 1;
      snapshot = {
        ...snapshot,
        loading: false,
        cancelled: outcome.cancelled,
        objects,
        loadedCount: outcome.objects.length,
        totalSelected: refs.length,
        labels,
        selectionId,
        error: "",
      };
    } catch (error) {
      if (mine !== ticket) return;
      const message = error instanceof Error ? error.message : "Não foi possível ler as propriedades.";
      snapshot = { ...snapshot, loading: false, error: message };
    }
    notify();
  }

  try {
    const current = await api.viewer.getSelection();
    gate.acknowledge(current);
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
      if (labelingActive) labelCancel = true;
    },
    async showLabels(payloads) {
      const job = ++labelJob;
      activeLabelJob = job;
      labelCancel = false;
      labelingActive = true;
      const stop = (): "cancel" | "abort" | null => {
        if (job !== labelJob) return "abort";
        if (labelCancel) return "cancel";
        return null;
      };
      const placed: LabelPayload[] = [];
      const placedIds: number[] = [];
      let created = 0;
      let realBoxes = 0;
      let boxError = "";
      let sample: Box3 | null = null;
      let previous: number[] = [];
      const describe = () => {
        const summary = placementSummary(sample, realBoxes, payloads.length);
        return boxError ? `${summary} getObjectBoundingBoxes: ${boxError}` : summary;
      };
      const publish = (labeling: boolean, cancelled: boolean, error = "", keepPrevious = true) => {
        if (job !== labelJob) return;
        labels = placed.map((payload, index) => ({
          id: placedIds[index] ?? 0,
          modelId: payload.modelId,
          runtimeId: payload.runtimeId,
          text: payload.text,
          color: payload.color,
        }));
        labelIds = keepPrevious ? [...new Set([...previous, ...placedIds])] : placedIds.slice();
        snapshot = {
          ...snapshot,
          labels,
          labeling,
          labelsPlaced: placed.length,
          labelsTotal: payloads.length,
          labelsCancelled: cancelled,
          error,
        };
        notify();
      };
      const remember = (error: string, detail: string) => {
        noteMarkup(created, error, detail);
      };
      try {
        previous = labelIds.slice();
        remember("nenhum", payloads.length === 0
          ? "O botão foi premido, mas não havia texto para etiquetar."
          : `A colocar ${payloads.length} etiquetas…`);
        if (stop() === "abort") return;
        if (payloads.length === 0) {
          if (previous.length > 0) await removeMarkupBatches(api.markup, previous, PROPERTY_BATCH);
          previous = [];
          publish(false, false, "", false);
          return;
        }
        if (stop() === "cancel") {
          publish(false, true);
          return;
        }
        publish(true, false);
        for (let start = 0; start < payloads.length; start += PROPERTY_BATCH) {
          const why = stop();
          if (why === "abort") {
            await removeMarkupBatches(api.markup, placedIds, PROPERTY_BATCH);
            return;
          }
          if (why === "cancel") {
            publish(false, true);
            remember("nenhum", `Colocação cancelada. ${describe()}`);
            return;
          }
          const attached = await attachBoxes(api, payloads.slice(start, start + PROPERTY_BATCH));
          realBoxes += attached.realBoxes;
          if (attached.boxError) boxError = attached.boxError;
          const withBox = attached.payloads.find((payload) => payload.box);
          if (withBox?.box) sample = withBox.box;
          if (stop() === "abort") {
            await removeMarkupBatches(api.markup, placedIds, PROPERTY_BATCH);
            return;
          }
          if (stop() === "cancel") {
            publish(false, true);
            remember("nenhum", `Colocação cancelada. ${describe()}`);
            return;
          }
          const chunk = attached.payloads;
          const result = await placeTextMarkups(
            api.markup,
            chunk,
            (payload) => toMarkup(payload, false),
            (payload) => toMarkup(payload, true),
            [...previous, ...placedIds],
          );
          if (job !== labelJob) {
            await removeMarkupBatches(api.markup, [...placedIds, ...result.ids], PROPERTY_BATCH);
            return;
          }
          created += result.accepted;
          placed.push(...chunk);
          placedIds.push(...result.ids);
          publish(true, false);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (previous.length > 0) await removeMarkupBatches(api.markup, previous, PROPERTY_BATCH);
        const detail = `Criadas ${created} de ${payloads.length}. ${describe()}`;
        const missingIds = created > 0 && placedIds.length === 0;
        const warning = missingIds
          ? `O visualizador aceitou ${created} etiquetas mas não devolveu identificadores. Se não aparecerem no modelo, envie esta mensagem. ${detail}`
          : "";
        remember(warning || "nenhum", detail);
        publish(false, labelCancel && placed.length < payloads.length, warning, false);
      } catch (error) {
        if (job !== labelJob) {
          await removeMarkupBatches(api.markup, placedIds, PROPERTY_BATCH);
          return;
        }
        const reason = error instanceof Error ? error.message : "Não foi possível criar as etiquetas.";
        const detail = describe();
        const message = `${reason} ${detail}`;
        remember(message, detail);
        labels = placed.map((payload, index) => ({
          id: placedIds[index] ?? 0,
          modelId: payload.modelId,
          runtimeId: payload.runtimeId,
          text: payload.text,
          color: payload.color,
        }));
        labelIds = [...new Set([...previous, ...placedIds])];
        snapshot = {
          ...snapshot,
          labels,
          labeling: false,
          labelsPlaced: placed.length,
          labelsTotal: payloads.length,
          error: message,
        };
        notify();
        throw new Error(message);
      } finally {
        if (activeLabelJob === job) labelingActive = false;
      }
    },
    async clearLabels() {
      labelJob += 1;
      labelCancel = true;
      labelingActive = false;
      const ids = labelIds.slice();
      labelIds = [];
      labels = [];
      snapshot = {
        ...snapshot,
        labels,
        labeling: false,
        labelsPlaced: 0,
        labelsTotal: 0,
        labelsCancelled: false,
      };
      notify();
      noteMarkup(0, "nenhum", ids.length > 0 ? "Etiquetas removidas desta extensão." : "Não havia etiquetas desta extensão para remover.");
      if (ids.length > 0) await removeMarkupBatches(api.markup, ids, PROPERTY_BATCH);
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
      const loaded = await loadCatalog((_loaded, _total) => undefined, () => false);
      return loaded.objects;
    },
    loadCatalog,
    async selectObjects(refs) {
      const groups = new Map<string, number[]>();
      for (const ref of refs) {
        const ids = groups.get(ref.modelId) ?? [];
        ids.push(ref.runtimeId);
        groups.set(ref.modelId, ids);
      }
      const selection = [...groups].map(([modelId, objectRuntimeIds]) => ({ modelId, objectRuntimeIds }));
      gate.acknowledge(selection);
      await api.viewer.setSelection({ modelObjectIds: selection }, "set");
      await applySelection(selection);
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

  async function loadCatalog(
    onProgress: (loaded: number, total: number) => void,
    shouldStop: () => boolean,
  ): Promise<{ objects: ReturnType<typeof toInquiredObject>[]; cancelled: boolean }> {
    const listed = await api.viewer.getObjects();
    const plan = (listed ?? []).map((model) => {
      const ids = (model.objects ?? []).map((object) => object.id).filter((id) => Number.isFinite(id));
      const cached = catalogCache.get(model.modelId) ?? new Map<number, ReturnType<typeof toInquiredObject>>();
      return { modelId: model.modelId, ids, cached, missing: ids.filter((id) => !cached.has(id)) };
    });
    const total = plan.reduce((sum, part) => sum + part.ids.length, 0);
    let loaded = plan.reduce((sum, part) => sum + (part.ids.length - part.missing.length), 0);
    onProgress(loaded, total);
    const objects: ReturnType<typeof toInquiredObject>[] = [];
    for (const part of plan) {
      for (let start = 0; start < part.missing.length; start += PROPERTY_BATCH) {
        if (shouldStop()) return { objects, cancelled: true };
        const chunk = part.missing.slice(start, start + PROPERTY_BATCH);
        const properties = await api.viewer.getObjectProperties(part.modelId, chunk);
        for (const raw of properties) part.cached.set(raw.id, toInquiredObject(part.modelId, raw, null));
        catalogCache.set(part.modelId, part.cached);
        loaded += chunk.length;
        onProgress(loaded, total);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      for (const id of part.ids) {
        const object = part.cached.get(id);
        if (object) objects.push(object);
      }
    }
    return { objects, cancelled: false };
  }
}

function selectionFromEvent(data: unknown): { groups: SelectionGroup[]; self: boolean } {
  if (Array.isArray(data)) return { groups: data as SelectionGroup[], self: false };
  const payload = data as SelectionEvent | undefined;
  return { groups: payload?.data ?? [], self: Boolean(payload?.origin?.isSelf) };
}

async function loadObjects(
  api: WorkspaceLike,
  refs: Array<{ modelId: string; runtimeId: number }>,
  onBatch: (loaded: number) => void,
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
      onBatch(loaded);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return { objects, cancelled: false };
}

async function attachBoxes(
  api: WorkspaceLike,
  payloads: LabelPayload[],
): Promise<{ payloads: LabelPayload[]; realBoxes: number; boxError: string }> {
  const boxes = new Map<string, Box3>();
  const byModel = new Map<string, number[]>();
  for (const payload of payloads) {
    const ids = byModel.get(payload.modelId) ?? [];
    ids.push(payload.runtimeId);
    byModel.set(payload.modelId, ids);
  }
  const problems: string[] = [];
  for (const [modelId, ids] of byModel) {
    try {
      const found = await api.viewer.getObjectBoundingBoxes(modelId, ids);
      for (const box of found ?? []) {
        if (!box?.boundingBox?.min || !box.boundingBox.max || !Number.isFinite(box.id)) continue;
        boxes.set(`${modelId}:${box.id}`, {
          min: { x: box.boundingBox.min.x, y: box.boundingBox.min.y, z: box.boundingBox.min.z },
          max: { x: box.boundingBox.max.x, y: box.boundingBox.max.y, z: box.boundingBox.max.z },
        });
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : "getObjectBoundingBoxes falhou.");
    }
  }
  let realBoxes = 0;
  const next = payloads.map((payload) => {
    const real = boxes.get(`${payload.modelId}:${payload.runtimeId}`);
    if (real) {
      realBoxes += 1;
      return { ...payload, box: real };
    }
    const box = payload.box ?? (payload.position ? boxFromPosition(payload.position) : null);
    return { ...payload, box };
  });
  return { payloads: next, realBoxes, boxError: problems[0] ?? "" };
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

function toMarkup(payload: LabelPayload, bind: boolean) {
  const box = payload.box ?? (payload.position ? boxFromPosition(payload.position) : {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 0.2, y: 0.2, z: 0.2 },
  });
  const ends = markupEnds(box, bind ? { modelId: payload.modelId, objectId: payload.runtimeId } : undefined);
  const pick = (point: { positionX: number; positionY: number; positionZ: number; modelId?: string; objectId?: number }): MarkupPick => ({
    positionX: point.positionX,
    positionY: point.positionY,
    positionZ: point.positionZ,
    ...(point.modelId ? { modelId: point.modelId, objectId: point.objectId } : {}),
  });
  return {
    text: payload.text,
    color: hexToRgba(payload.color),
    start: pick(ends.start),
    end: pick(ends.end),
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
    loadCatalog: async () => ({ objects: [], cancelled: false }),
    selectObjects: async () => undefined,
    colorByObject: async () => undefined,
    cancelLoad: () => undefined,
  };
}
