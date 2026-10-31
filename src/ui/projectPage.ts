import type { ProjectFileItem } from "../domain/files";
import { APP_VERSION } from "../domain/types";
import type { ProjectDetails, ProjectUser } from "../domain/project";
import type { ProjectPageSource } from "../host/projectTypes";
import { escapeHtml } from "./html";

const SECTIONS = [
  { id: "projeto", label: "Projeto" },
  { id: "modelos", label: "Modelos" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export async function startProjectPage(root: HTMLElement, source: ProjectPageSource): Promise<void> {
  let section: SectionId = "projeto";
  let project: ProjectDetails | null = null;
  let user: ProjectUser | null = null;
  let error = "";
  let folderId: string | null = null;
  const crumbs: Array<{ id: string | null; name: string }> = [{ id: null, name: "Raiz" }];
  let files: ProjectFileItem[] = [];
  let filesNote = "";
  let filesStatus = "";

  const paint = () => {
    root.innerHTML = pageHtml({
      mode: source.mode,
      section,
      project,
      user,
      error,
      crumbs,
      files,
      filesNote,
      filesStatus,
    });
  };

  const showFiles = async (nextFolder: string | null) => {
    folderId = nextFolder;
    filesNote = "A ler pastas e modelos…";
    paint();
    try {
      const listing = await source.listFolder(nextFolder);
      folderId = listing.folderId || nextFolder;
      files = listing.items;
      filesNote = listing.note;
    } catch (cause) {
      files = [];
      filesNote = cause instanceof Error ? cause.message : "Não foi possível ler os ficheiros.";
    }
    paint();
  };

  source.onCommand((command) => {
    if (!SECTIONS.some((item) => item.id === command)) return;
    section = command as SectionId;
    void source.activateMenu(command);
    if (section === "modelos" && files.length === 0 && !filesNote) void showFiles(folderId);
    else paint();
  });

  const onClick = async (event: Event) => {
    const target = event.target as HTMLElement;
    const command = target.closest<HTMLElement>("[data-command]")?.dataset.command;
    if (command && SECTIONS.some((item) => item.id === command)) {
      section = command as SectionId;
      void source.activateMenu(command);
      if (section === "modelos") void showFiles(folderId);
      else paint();
      return;
    }
    const folder = target.closest<HTMLElement>("[data-folder]")?.dataset.folder;
    if (folder) {
      const name = target.closest<HTMLElement>("[data-name]")?.dataset.name ?? "Pasta";
      crumbs.push({ id: folder, name });
      void showFiles(folder);
      return;
    }
    if (target.closest("[data-action='files-up']")) {
      crumbs.pop();
      const previous = crumbs[crumbs.length - 1];
      void showFiles(previous?.id ?? null);
      return;
    }
    const modelId = target.closest<HTMLElement>("[data-open-model]")?.dataset.openModel;
    if (modelId) {
      const item = files.find((file) => file.id === modelId);
      if (!item) return;
      filesStatus = "A abrir o visualizador…";
      paint();
      try {
        filesStatus = await source.openModel(item);
      } catch (cause) {
        filesStatus = cause instanceof Error ? cause.message : "Não foi possível abrir o modelo.";
      }
      paint();
    }
  };

  paint();
  root.addEventListener("click", (event) => { void onClick(event); });

  try {
    const loaded = await source.load();
    project = loaded.project;
    user = loaded.user;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Não foi possível ler o projeto.";
  }
  paint();
}

function pageHtml(state: {
  mode: ProjectPageSource["mode"];
  section: SectionId;
  project: ProjectDetails | null;
  user: ProjectUser | null;
  error: string;
  crumbs: Array<{ id: string | null; name: string }>;
  files: ProjectFileItem[];
  filesNote: string;
  filesStatus: string;
}): string {
  const icon = `${import.meta.env.BASE_URL}icon.svg`;
  const where = state.mode === "demo" ? "Modo de demonstração" : "Ligado ao Trimble Connect";
  return `<div class="project-page" data-mode="${state.mode}">
    <header class="project-header">
      <img src="${icon}" alt="" width="40" height="40" />
      <div>
        <h1>Consultar Objetos</h1>
        <p>Página do projeto</p>
      </div>
    </header>
    <p class="project-note">No Trimble Connect este atalho fica no menu da esquerda, junto de Shared Model e ToDo. Aqui os mesmos destinos estão nesta barra.</p>
    <nav class="project-nav" aria-label="Secções do projeto" data-testid="menu-projeto">
      ${SECTIONS.map((item) => `<button type="button" data-command="${item.id}" class="${item.id === state.section ? "is-active" : ""}" aria-current="${item.id === state.section ? "page" : "false"}">${item.label}</button>`).join("")}
    </nav>
    <main class="project-main">
      ${state.error ? `<p class="banner" role="alert">${escapeHtml(state.error)}</p>` : ""}
      ${state.section === "projeto" ? infoHtml(state.project, state.user) : ""}
      ${state.section === "modelos" ? filesHtml(state.crumbs, state.files, state.filesNote, state.filesStatus) : ""}
    </main>
    <footer class="panel-footer">${where} · v${APP_VERSION}</footer>
  </div>`;
}

function filesHtml(
  crumbs: Array<{ id: string | null; name: string }>,
  files: ProjectFileItem[],
  note: string,
  status: string,
): string {
  const rows = files.map((file) => {
    const action = file.kind === "folder"
      ? `<button type="button" data-folder="${escapeHtml(file.id)}" data-name="${escapeHtml(file.name)}">Abrir pasta</button>`
      : file.model
        ? `<button type="button" data-open-model="${escapeHtml(file.id)}">Abrir no visualizador 3D</button>`
        : "";
    return `<tr>
      <td>${escapeHtml(file.name)}</td>
      <td>${file.kind === "folder" ? "Pasta" : file.model ? "Modelo" : "Ficheiro"}</td>
      <td>${action}</td>
    </tr>`;
  }).join("");
  const up = crumbs.length > 1 ? `<button type="button" data-action="files-up" data-testid="subir-pasta">Pasta anterior</button>` : "";
  return `<section data-testid="seccao-modelos">
    <h2>Modelos e pastas</h2>
    <p class="crumbs" data-testid="caminho">${crumbs.map((crumb) => escapeHtml(crumb.name)).join(" / ")}</p>
    ${up}
    ${note ? `<p class="${note.startsWith("Não foi possível") || note.includes("token de acesso") ? "warning" : "muted"}" data-testid="aviso-ficheiros">${escapeHtml(note)}</p>` : ""}
    ${status ? `<p class="feedback" data-testid="aviso-modelo">${escapeHtml(status)}</p>` : ""}
    <table class="file-table" data-testid="tabela-ficheiros">
      <thead><tr><th>Nome</th><th>Tipo</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="3">Esta pasta não tem ficheiros.</td></tr>`}</tbody>
    </table>
  </section>`;
}

function infoHtml(project: ProjectDetails | null, user: ProjectUser | null): string {
  if (!project || !user) return `<p class="muted">A ler o projeto…</p>`;
  const userLine = user.email ? `${user.name} · ${user.email}` : user.name;
  return `<section data-testid="seccao-projeto">
    <h2>Informação do projeto</h2>
    <dl class="facts">
      <div><dt>Nome</dt><dd data-testid="nome-projeto">${escapeHtml(project.name)}</dd></div>
      <div><dt>Identificador</dt><dd data-testid="id-projeto">${escapeHtml(project.id)}</dd></div>
      <div><dt>Região</dt><dd data-testid="regiao-projeto">${escapeHtml(project.locationLabel)}${project.location ? ` · ${escapeHtml(project.location)}` : ""}</dd></div>
      <div><dt>Local</dt><dd>${project.address ? escapeHtml(project.address) : "Não indicado"}</dd></div>
      <div><dt>Utilizador</dt><dd data-testid="utilizador-projeto">${escapeHtml(userLine)}</dd></div>
    </dl>
  </section>`;
}
