import { flattenSelection } from "../domain/properties";
import type { SelectionGroup } from "../domain/types";

/** Wait out the burst of events a box selection emits, then read once. */
export const SELECTION_SETTLE_MS = 280;

/** Keep the previous list on screen until a slow read is worth announcing. */
export const PROGRESS_DELAY_MS = 300;

export function selectionSignature(groups: SelectionGroup[] | null | undefined): string {
  const refs = flattenSelection(groups);
  refs.sort((left, right) => (left.modelId < right.modelId ? -1 : left.modelId > right.modelId ? 1 : left.runtimeId - right.runtimeId));
  return refs.map((ref) => `${ref.modelId}\u0000${ref.runtimeId}`).join("\n");
}

export interface SelectionGate {
  push(groups: SelectionGroup[]): void;
  acknowledge(groups: SelectionGroup[]): void;
}

/**
 * Coalesces selection events. An event whose objects match the selection
 * already applied is ignored, including one that arrives while a different
 * change is still waiting. A real change cancels that wait and starts again.
 */
export function createSelectionGate(apply: (groups: SelectionGroup[]) => void, delayMs = SELECTION_SETTLE_MS): SelectionGate {
  let applied = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: SelectionGroup[] | null = null;

  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  return {
    acknowledge(groups) {
      applied = selectionSignature(groups);
      pending = null;
      clearTimer();
    },
    push(groups) {
      const signature = selectionSignature(groups);
      if (signature === applied) {
        pending = null;
        clearTimer();
        return;
      }
      pending = groups;
      clearTimer();
      timer = setTimeout(() => {
        timer = undefined;
        const next = pending;
        pending = null;
        if (!next) return;
        const nextSignature = selectionSignature(next);
        if (nextSignature === applied) return;
        applied = nextSignature;
        apply(next);
      }, delayMs);
    },
  };
}
