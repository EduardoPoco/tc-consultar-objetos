import type { ColumnSet, InquiredObject, LabelPayload, TextLabel } from "../domain/types";
import type { DemoPiece } from "../demo/fixtures";

export interface ColumnSetResult {
  sets: ColumnSet[];
  activeName: string | null;
}

export interface HostSnapshot {
  objects: InquiredObject[];
  totalSelected: number;
  labels: TextLabel[];
  isolated: boolean;
  isolatedRuntimeIds: number[];
  highlightColor: string | null;
  objectColors: Record<string, string>;
  loading: boolean;
  error: string;
  connectionFailed: boolean;
}

export interface ViewerHost {
  readonly mode: "demo" | "trimble";
  subscribe(listener: () => void): () => void;
  snapshot(): HostSnapshot;
  loadColumnSets(): Promise<ColumnSetResult | null>;
  showLabels(payloads: LabelPayload[]): Promise<void>;
  clearLabels(): Promise<void>;
  isolate(objects: InquiredObject[], color: string): Promise<void>;
  resetAppearance(): Promise<void>;
  projectId(): Promise<string>;
  listAllObjects(): Promise<InquiredObject[]>;
  colorByObject(entries: Array<{ modelId: string; runtimeId: number; color: string }>): Promise<void>;
}

export interface DemoHost extends ViewerHost {
  readonly mode: "demo";
  pieces(): DemoPiece[];
  select(runtimeIds: number[], how: "set" | "add" | "toggle"): void;
  selectMany(): void;
  clearSelection(): void;
}

export function isDemoHost(host: ViewerHost): host is DemoHost {
  return host.mode === "demo";
}
