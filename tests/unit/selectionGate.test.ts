import { afterEach, describe, expect, it, vi } from "vitest";
import { createSelectionGate, selectionSignature } from "../../src/host/selectionGate";
import type { SelectionGroup } from "../../src/domain/types";

const group = (ids: number[]): SelectionGroup[] => [{ modelId: "modelo", objectRuntimeIds: ids }];

describe("eventos de seleção", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignora uma seleção igual e junta a rajada da seleção por área numa só leitura", () => {
    vi.useFakeTimers();
    const applied: string[] = [];
    const gate = createSelectionGate((groups) => applied.push(selectionSignature(groups)));

    gate.push(group([1]));
    gate.push(group([1, 2]));
    gate.push(group([1, 2, 3, 4, 5]));
    gate.push(group([5, 4, 3, 2, 1]));
    vi.advanceTimersByTime(279);
    expect(applied).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(applied).toEqual([selectionSignature(group([1, 2, 3, 4, 5]))]);

    gate.push(group([1, 2, 3, 4, 5]));
    gate.push(group([5, 1, 4, 2, 3]));
    vi.advanceTimersByTime(1000);
    expect(applied).toHaveLength(1);
  });

  it("cancela a leitura anterior quando a seleção muda de verdade", () => {
    vi.useFakeTimers();
    const applied: string[] = [];
    const gate = createSelectionGate((groups) => applied.push(selectionSignature(groups)), 280);
    gate.push(group([1, 2]));
    vi.advanceTimersByTime(280);
    gate.push(group([9]));
    vi.advanceTimersByTime(280);
    expect(applied.map((signature) => signature.endsWith("\u00009"))).toEqual([false, true]);
    expect(applied).toHaveLength(2);
  });

  it("uma repetição durante a espera anula a mudança que ainda não foi aplicada", () => {
    vi.useFakeTimers();
    const applied: string[] = [];
    const gate = createSelectionGate((groups) => applied.push(selectionSignature(groups)));
    gate.acknowledge(group([1, 2, 3, 4, 5]));
    gate.push(group([8]));
    gate.push(group([5, 4, 3, 2, 1]));
    vi.advanceTimersByTime(1000);
    expect(applied).toEqual([]);
  });
});
