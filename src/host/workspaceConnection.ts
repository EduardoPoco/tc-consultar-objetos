import { connect, type WorkspaceAPI } from "trimble-connect-workspace-api";
import { chooseHost, withTimeout, type HostChoice, type ViewerProbe } from "./hostChoice";

export type WorkspaceEventListener = (event: string, data: unknown) => void;

interface WorkspaceEvent {
  event: string;
  data: unknown;
}

export interface WorkspaceConnection {
  api: WorkspaceAPI;
  subscribe(listener: WorkspaceEventListener): () => void;
}

const PROBE_MS = 2000;
const BACKLOG_LIMIT = 30;

export async function connectWorkspace(): Promise<WorkspaceConnection> {
  const listeners = new Set<WorkspaceEventListener>();
  const backlog: WorkspaceEvent[] = [];
  const api = await connect(
    window.parent,
    ((event: string, data: unknown) => {
      backlog.push({ event, data });
      if (backlog.length > BACKLOG_LIMIT) backlog.shift();
      for (const listener of listeners) listener(event, data);
    }) as Parameters<typeof connect>[1],
    10000,
  );
  return {
    api,
    subscribe(listener) {
      listeners.add(listener);
      for (const item of backlog) listener(item.event, item.data);
      return () => listeners.delete(listener);
    },
  };
}

export async function detectHost(connection: WorkspaceConnection): Promise<HostChoice> {
  const reported = await reportedHost(connection);
  const viewer = await probeViewer(connection);
  return chooseHost(reported, viewer);
}

async function reportedHost(connection: WorkspaceConnection): Promise<string | null> {
  try {
    const host = await withTimeout(connection.api.extension.getHost(), PROBE_MS);
    return host?.name ?? null;
  } catch {
    return null;
  }
}

async function probeViewer(connection: WorkspaceConnection): Promise<ViewerProbe> {
  try {
    await withTimeout(connection.api.viewer.getSelection(), PROBE_MS);
    return "ok";
  } catch (error) {
    return error instanceof Error && error.message === "timeout" ? "unknown" : "fail";
  }
}
