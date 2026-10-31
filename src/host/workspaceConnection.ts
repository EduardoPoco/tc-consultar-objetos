import { connect, type WorkspaceAPI } from "trimble-connect-workspace-api";

export type WorkspaceEventListener = (event: string, data: unknown) => void;

export interface WorkspaceConnection {
  api: WorkspaceAPI;
  subscribe(listener: WorkspaceEventListener): () => void;
}

export async function connectWorkspace(): Promise<WorkspaceConnection> {
  const listeners = new Set<WorkspaceEventListener>();
  const api = await connect(
    window.parent,
    ((event: string, data: unknown) => {
      for (const listener of listeners) listener(event, data);
    }) as Parameters<typeof connect>[1],
    10000,
  );
  return {
    api,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export async function hostKind(connection: WorkspaceConnection): Promise<"project" | "3dviewer"> {
  try {
    const host = await connection.api.extension.getHost();
    return host?.name === "project" ? "project" : "3dviewer";
  } catch {
    return "3dviewer";
  }
}
