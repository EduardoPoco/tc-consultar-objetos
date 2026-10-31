import type { ProjectFileItem } from "../domain/files";
import type { ProjectDetails, ProjectUser } from "../domain/project";
import { formatUser, locationLabel } from "../domain/project";

export interface DemoProjectOptions {
  name?: string | null;
}

export const DEMO_PROJECT_NAME = "OB3270-SNF-BC Metalnord";

export function demoProject(options: DemoProjectOptions = {}): ProjectDetails {
  const name = options.name?.trim() ? options.name.trim() : DEMO_PROJECT_NAME;
  const location = "europe";
  return {
    id: "projeto-demonstracao",
    name,
    location,
    locationLabel: locationLabel(location),
    address: "Setúbal, Portugal",
  };
}

export function demoUser(): ProjectUser {
  return formatUser({ firstName: "Ana", lastName: "Martins", email: "ana.martins@exemplo.pt" });
}

const DEMO_FILES: ProjectFileItem[] = [
  { id: "pasta-estrutura", name: "Estrutura", kind: "folder", model: false, versionId: "", parentId: "" },
  { id: "arq", name: "Arquitetura.ifc", kind: "file", model: true, versionId: "versao-arq", parentId: "" },
  { id: "notas", name: "Notas.pdf", kind: "file", model: false, versionId: "versao-notas", parentId: "" },
  { id: "est", name: "Estrutura.ifc", kind: "file", model: true, versionId: "versao-est", parentId: "pasta-estrutura" },
];

export function demoFolder(folderId: string | null): ProjectFileItem[] {
  const parent = folderId ?? "";
  return DEMO_FILES.filter((item) => item.parentId === parent);
}
