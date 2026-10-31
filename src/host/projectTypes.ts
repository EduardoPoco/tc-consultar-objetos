import type { ProjectFileItem } from "../domain/files";
import type { ProjectDetails, ProjectUser } from "../domain/project";

export interface FolderListing {
  items: ProjectFileItem[];
  folderId: string;
  note: string;
}

export interface ProjectPageSource {
  mode: "demo" | "trimble";
  load(): Promise<{ project: ProjectDetails; user: ProjectUser }>;
  listFolder(folderId: string | null): Promise<FolderListing>;
  openModel(item: ProjectFileItem): Promise<string>;
  activateMenu(command: string): Promise<void>;
  onCommand(listener: (command: string) => void): () => void;
}

export function extensionIconUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}icon.svg`, window.location.href).href;
}
