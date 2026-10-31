import {
  FILES_PERMISSION_MESSAGE,
  apiBaseForLocation,
  fileItemsFromPayload,
  rootFolderId,
  tokenFromEvent,
  type ProjectFileItem,
} from "../domain/files";
import type { WorkspaceConnection } from "./workspaceConnection";

export interface FolderListing {
  items: ProjectFileItem[];
  folderId: string;
  note: string;
}

export async function listProjectFolder(
  connection: WorkspaceConnection,
  location: string,
  projectId: string,
  folderId: string | null,
): Promise<FolderListing> {
  const base = apiBaseForLocation(location);
  if (!base) {
    return {
      items: [],
      folderId: folderId ?? "",
      note: `${FILES_PERMISSION_MESSAGE} A região «${location || "desconhecida"}» não corresponde a Europe, North America ou Asia, por isso o servidor da API não foi escolhido.`,
    };
  }
  let token = "";
  try {
    token = await acquireToken(connection);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    return { items: [], folderId: folderId ?? "", note: detail ? `${FILES_PERMISSION_MESSAGE} (${detail})` : FILES_PERMISSION_MESSAGE };
  }
  try {
    const current = folderId || await fetchRootId(base, token, projectId);
    const response = await fetch(`${base}/folders/${encodeURIComponent(current)}/items`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) {
      return { items: [], folderId: current, note: `${FILES_PERMISSION_MESSAGE} A API respondeu ${response.status}.` };
    }
    const payload: unknown = await response.json();
    const items = fileItemsFromPayload(payload, current).sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
      return left.name.localeCompare(right.name, "pt-PT");
    });
    return { items, folderId: current, note: "" };
  } catch {
    return {
      items: [],
      folderId: folderId ?? "",
      note: `${FILES_PERMISSION_MESSAGE} O browser bloqueou o pedido ou o servidor não respondeu (muitas vezes por CORS, se a origem da extensão não estiver autorizada na Developer Console).`,
    };
  }
}

async function fetchRootId(base: string, token: string, projectId: string): Promise<string> {
  const response = await fetch(`${base}/projects/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const root = rootFolderId(payload);
  if (!root) throw new Error("sem pasta de raiz");
  return root;
}

function acquireToken(connection: WorkspaceConnection): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (token: string) => {
      if (settled || !token) return;
      settled = true;
      clearTimeout(timer);
      stop();
      resolve(token);
    };
    const stop = connection.subscribe((event, data) => {
      if (event !== "extension.accessToken") return;
      finish(tokenFromEvent(data));
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      stop();
      reject(new Error("o token não chegou"));
    }, 4000);
    connection.api.extension.requestPermission("accesstoken").then((status) => {
      finish(tokenFromEvent(status));
    }).catch(() => {
      // The access-token event may still arrive.
    });
  });
}
