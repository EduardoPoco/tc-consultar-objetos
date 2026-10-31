export interface ProjectFileItem {
  id: string;
  name: string;
  kind: "folder" | "file";
  model: boolean;
  versionId: string;
  parentId: string;
}

const REGION_API: Record<string, string> = {
  europe: "https://app.connect.trimble.eu/tc/api/2.0",
  eu: "https://app.connect.trimble.eu/tc/api/2.0",
  northamerica: "https://app.connect.trimble.com/tc/api/2.0",
  us: "https://app.connect.trimble.com/tc/api/2.0",
  asia: "https://app.connect.trimble.com.au/tc/api/2.0",
  australia: "https://app.connect.trimble.com.au/tc/api/2.0",
};

const MODEL_EXTENSIONS = new Set([
  "ifc", "ifczip", "trb", "rvt", "rfa", "dwg", "dxf", "dgn", "dwf", "dwfx",
  "nwd", "nwc", "skp", "obj", "stl", "las", "laz", "e57", "db1",
]);

export const FILES_PERMISSION_MESSAGE = "Não foi possível listar os modelos. O Trimble Connect só entrega o token de acesso (extension.requestPermission(\"accesstoken\"), no evento extension.accessToken) a uma extensão autorizada. Isso exige, em geral, uma aplicação na Trimble Developer Console com o endereço https://eduardopoco.github.io/tc-consultar-objetos/ e permissão para ler os ficheiros do projeto. O resto desta página não depende dessa lista.";

export function apiBaseForLocation(location: string | undefined): string | null {
  const key = (location ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!key) return null;
  if (key in REGION_API) return REGION_API[key];
  if (key.includes("europe")) return REGION_API.europe;
  if (key.includes("asia") || key.includes("australia")) return REGION_API.asia;
  if (key.includes("america") || key.includes("north")) return REGION_API.northamerica;
  return null;
}

export function isModelName(name: string): boolean {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return MODEL_EXTENSIONS.has(extension);
}

export function rootFolderId(project: Record<string, unknown>): string {
  const candidates = [project.rootId, project.rootFolderId, project.rootFolder, project.root];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === "object" && "id" in candidate) {
      const id = (candidate as { id?: unknown }).id;
      if (typeof id === "string" && id.trim()) return id.trim();
    }
  }
  return "";
}

export function fileItemsFromPayload(payload: unknown, parentId: string): ProjectFileItem[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? (payload as { items?: unknown; children?: unknown }).items
        ?? (payload as { children?: unknown }).children
        ?? []
      : [];
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const id = stringValue(raw.id ?? raw.identifier);
    const name = stringValue(raw.name ?? raw.fileName);
    if (!id || !name) return [];
    const type = stringValue(raw.type ?? raw.itemType).toUpperCase();
    const kind = type.includes("FOLDER") ? "folder" : "file";
    const version = raw.version && typeof raw.version === "object"
      ? stringValue((raw.version as { id?: unknown }).id)
      : "";
    return [{
      id,
      name,
      kind,
      model: kind === "file" && isModelName(name),
      versionId: stringValue(raw.versionId) || version,
      parentId: stringValue(raw.parentId) || parentId,
    } satisfies ProjectFileItem];
  });
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function tokenFromEvent(data: unknown): string {
  if (typeof data === "string") return usableToken(data);
  if (data && typeof data === "object" && "data" in data) return tokenFromEvent((data as { data?: unknown }).data);
  return "";
}

function usableToken(value: string): string {
  const token = value.trim();
  if (!token || token === "granted" || token === "denied" || token === "prompt") return "";
  return token.length >= 20 ? token : "";
}
