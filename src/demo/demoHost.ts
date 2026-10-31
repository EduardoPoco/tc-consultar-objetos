import { flattenSelection, toInquiredObject } from "../domain/properties";
import type { LabelPayload, TextLabel } from "../domain/types";
import { createSelectionGate } from "../host/selectionGate";
import type { DemoHost, HostSnapshot } from "../host/types";
import { DEMO_COLUMN_SETS, DEMO_MODEL_ID, demoPieces, findDemoEntry } from "./fixtures";

export interface DemoHostOptions {
  dataTable: boolean;
}

export function createDemoHost(options: DemoHostOptions): DemoHost {
  const listeners = new Set<() => void>();
  let selected: number[] = [];
  let labels: TextLabel[] = [];
  let nextLabelId = 1;
  let isolated = false;
  let isolatedRuntimeIds: number[] = [];
  let highlightColor: string | null = null;
  let objectColors: Record<string, string> = {};
  let error = "";
  let selectionId = 0;
  let reads = 0;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const inquired = () => {
    const objects = selected.flatMap((runtimeId) => {
      const entry = findDemoEntry(runtimeId);
      if (!entry) return [];
      return [toInquiredObject(DEMO_MODEL_ID, entry.raw, entry.box)];
    });
    return { objects, total: selected.length };
  };

  const snapshot = (): HostSnapshot => {
    const current = inquired();
    const visible = labels.filter((label) => current.objects.some((object) => object.runtimeId === label.runtimeId));
    return {
      objects: current.objects,
      totalSelected: current.total,
      labels: visible,
      isolated,
      isolatedRuntimeIds,
      highlightColor,
      objectColors,
      loading: false,
      loadedCount: current.objects.length,
      cancelled: false,
      labeling: false,
      labelsPlaced: visible.length,
      labelsTotal: visible.length,
      labelsCancelled: false,
      selectionId,
      error,
      connectionFailed: false,
    };
  };

  const gate = createSelectionGate((groups) => {
    reads += 1;
    selectionId += 1;
    selected = flattenSelection(groups).map((ref) => ref.runtimeId);
    notify();
  });

  return {
    mode: "demo",
    pieces: () => demoPieces(),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    async loadColumnSets() {
      if (!options.dataTable) return null;
      return { sets: DEMO_COLUMN_SETS.map((set) => ({ ...set, columns: set.columns.map((column) => ({ ...column })) })), activeName: "Aprovisionamento" };
    },
    async showLabels(payloads) {
      labels = payloads.map((payload) => toLabel(payload, nextLabelId++));
      error = "";
      notify();
    },
    async clearLabels() {
      labels = [];
      notify();
    },
    async isolate(objects, color) {
      isolated = objects.length > 0;
      isolatedRuntimeIds = objects.map((object) => object.runtimeId);
      highlightColor = color;
      objectColors = {};
      error = "";
      notify();
    },
    async resetAppearance() {
      isolated = false;
      isolatedRuntimeIds = [];
      highlightColor = null;
      objectColors = {};
      notify();
    },
    cancelLoad() {
      return undefined;
    },
    async colorByObject(entries) {
      objectColors = {};
      for (const entry of entries) objectColors[`${entry.modelId}:${entry.runtimeId}`] = entry.color;
      isolated = false;
      isolatedRuntimeIds = [];
      highlightColor = null;
      notify();
    },
    async projectId() {
      return "demonstracao";
    },
    async listAllObjects() {
      return demoPieces().flatMap((piece) => {
        const entry = findDemoEntry(piece.runtimeId);
        return entry ? [toInquiredObject(DEMO_MODEL_ID, entry.raw, entry.box)] : [];
      });
    },
    select(runtimeIds, how) {
      selectionId += 1;
      if (how === "set") {
        selected = [...runtimeIds];
      } else if (how === "add") {
        for (const id of runtimeIds) {
          if (!selected.includes(id)) selected.push(id);
        }
      } else {
        for (const id of runtimeIds) {
          const index = selected.indexOf(id);
          if (index >= 0) selected.splice(index, 1);
          else selected.push(id);
        }
      }
      notify();
    },
    selectMany() {
      selectionId += 1;
      selected = [...demoPieces().map((piece) => piece.runtimeId), ...Array.from({ length: 17 }, (_, index) => 101 + index)];
      notify();
    },
    clearSelection() {
      selectionId += 1;
      selected = [];
      notify();
    },
    emitSelection(groups) {
      gate.push(groups);
    },
    readCount() {
      return reads;
    },
  };
}

function toLabel(payload: LabelPayload, id: number): TextLabel {
  return {
    id,
    modelId: payload.modelId,
    runtimeId: payload.runtimeId,
    text: payload.text,
    color: payload.color,
  };
}
