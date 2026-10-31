import type { ProjectDetails, ProjectUser } from "../domain/project";
import { formatUser, locationLabel } from "../domain/project";
import { demoProject, demoUser } from "../demo/projectDemo";
import { extensionIconUrl, type ProjectPageSource } from "./projectTypes";
import type { WorkspaceConnection } from "./workspaceConnection";

const MENU = {
  title: "Consultar Objetos",
  command: "projeto",
  subMenus: [{ command: "projeto", title: "Projeto" }],
};

export function createDemoProjectSource(name: string | null): ProjectPageSource {
  return {
    mode: "demo",
    async load() {
      return { project: demoProject({ name }), user: demoUser() };
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
      const details: ProjectDetails = {
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
