import type { ProjectDetails, ProjectUser } from "../domain/project";

export interface ProjectPageSource {
  mode: "demo" | "trimble";
  load(): Promise<{ project: ProjectDetails; user: ProjectUser }>;
  activateMenu(command: string): Promise<void>;
  onCommand(listener: (command: string) => void): () => void;
}

export function extensionIconUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}icon.svg`, window.location.href).href;
}
