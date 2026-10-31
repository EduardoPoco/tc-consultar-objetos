import type { ProjectDetails, ProjectUser } from "../domain/project";
import { formatUser, locationLabel } from "../domain/project";
import { demoFolder, demoProject, demoUser } from "../demo/projectDemo";
import { extensionIconUrl, type ProjectPageSource } from "./projectTypes";
import { listProjectFolder } from "./projectFiles";
import type { WorkspaceConnection } from "./workspaceConnection";

const MENU = {
  title: "Consultar Objetos",
  command: "projeto",
  subMenus: [
    { command: "projeto", title: "Projeto" },
    { command: "modelos", title: "Modelos" },
  ],
};

export function createDemoProjectSource(name: string | null): ProjectPageSource {
  return {
    mode: "demo",
    async load() {
      return { project: demoProject({ name }), user: demoUser() };
    },
    async listFolder(folderId) {
      return {
        items: demoFolder(folderId),
        folderId: folderId ?? "",
        note: "Lista de demonstração. No Trimble Connect os ficheiros vêm da API do projeto, depois de um token de acesso.",
      };
    },
    async openModel(item) {
      return `No Trimble Connect, «${item.name}» abriria no visualizador 3D.`;
    },
    async activateMenu() {
      return undefined;
    },
    onCommand() {
      return () => undefined;
    },
  };
}

export function createTrimbleProjectSource(connection: WorkspaceConnection): ProjectPageSource {
  const listeners = new Set<(command: string) => void>();
  let details: ProjectDetails | null = null;
  connection.subscribe((event, data) => {
    if (event !== "extension.command") return;
    const command = commandFromEvent(data);
    if (!command) return;
    for (const listener of listeners) listener(command);
  });

  return {
    mode: "trimble",
    async load() {
      const [project, user] = await Promise.all([
        connection.api.project.getProject(),
        connection.api.user.getUser(),
      ]);
      details = {
        id: project.id,
        name: project.name?.trim() || "Projeto sem nome",
        location: project.location?.trim() ?? "",
        locationLabel: locationLabel(project.location),
        address: project.address?.text?.trim() ?? "",
      };
      const person: ProjectUser = formatUser(user);
      void registerMenu(connection);
      return { project: details, user: person };
    },
    async listFolder(folderId) {
      if (!details) return { items: [], folderId: "", note: "O projeto ainda não foi lido." };
      return listProjectFolder(connection, details.location, details.id, folderId);
    },
    async openModel(item) {
      if (!details) return "O projeto ainda não foi lido.";
      await connection.api.extension.goTo("3dviewer", {
        projectId: details.id,
        modelId: item.id,
        versionId: item.versionId || undefined,
      });
      return `A abrir «${item.name}» no visualizador 3D.`;
    },
    async activateMenu(command) {
      try {
        await connection.api.ui.setActiveMenuItem(command);
      } catch {
        // The in-page navigation still works when the host menu rejects the command.
      }
    },
    onCommand(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

async function registerMenu(connection: WorkspaceConnection): Promise<void> {
  try {
    await connection.api.ui.setMenu({
      ...MENU,
      icon: extensionIconUrl(),
      subMenus: MENU.subMenus.map((item) => ({ ...item, icon: extensionIconUrl() })),
    });
  } catch {
    // The page remains usable through its own navigation if the left menu cannot be set.
  }
}

function commandFromEvent(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "data" in data && typeof data.data === "string") return data.data;
  return "";
}
