import { capSelection, toInquiredObject } from "../domain/properties";
import type { LabelPayload, TextLabel } from "../domain/types";
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
  let error = "";

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const inquired = () => {
    const refs = selected.map((runtimeId) => ({ modelId: DEMO_MODEL_ID, runtimeId }));
    const capped = capSelection(refs);
    const objects = capped.kept.flatMap((ref) => {
      const entry = findDemoEntry(ref.runtimeId);
      if (!entry) return [];
      return [toInquiredObject(DEMO_MODEL_ID, entry.raw, entry.box)];
    });
    return { objects, total: capped.total };
  };

  const snapshot = (): HostSnapshot => {
    const current = inquired();
    return {
      objects: current.objects,
      totalSelected: current.total,
      labels: labels.filter((label) => current.objects.some((object) => object.runtimeId === label.runtimeId)),
      isolated,
      isolatedRuntimeIds,
      highlightColor,
      loading: false,
      error,
      connectionFailed: false,
    };
  };

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
      error = "";
      notify();
    },
    async resetAppearance() {
      isolated = false;
      isolatedRuntimeIds = [];
      highlightColor = null;
      notify();
    },
    select(runtimeIds, how) {
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
      selected = [...demoPieces().map((piece) => piece.runtimeId), ...Array.from({ length: 17 }, (_, index) => 101 + index)];
      notify();
    },
    clearSelection() {
      selected = [];
      notify();
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
