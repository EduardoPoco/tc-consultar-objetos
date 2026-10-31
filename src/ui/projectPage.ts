import type { ProjectFileItem } from "../domain/files";
import { isHttpUrl, loadLinks, saveLinks, upsertLink, type ExternalLink } from "../domain/links";
import { APP_VERSION } from "../domain/types";
import type { ProjectDetails, ProjectUser } from "../domain/project";
import type { ProjectPageSource } from "../host/projectTypes";
import { escapeHtml } from "./html";

const SECTIONS = [
  { id: "projeto", label: "Projeto" },
  { id: "modelos", label: "Modelos" },
  { id: "ligacoes", label: "Ligações" },
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
  let links: ExternalLink[] = [];
  let linkDraft = { id: "", name: "", url: "" };
  let linkMessage = "";

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
      links,
      linkDraft,
      linkMessage,
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
    const linkAction = target.closest<HTMLElement>("[data-link-action]")?.dataset.linkAction;
    if (linkAction && project) {
      if (linkAction === "edit") {
        const id = target.closest<HTMLElement>("[data-link-id]")?.dataset.linkId ?? "";
        const current = links.find((link) => link.id === id);
        if (current) linkDraft = { ...current };
        linkMessage = "";
        paint();
        return;
      }
      if (linkAction === "delete") {
        const id = target.closest<HTMLElement>("[data-link-id]")?.dataset.linkId ?? "";
        links = links.filter((link) => link.id !== id);
        saveLinks(localStorage, project.id, links);
        if (linkDraft.id === id) linkDraft = { id: "", name: "", url: "" };
        linkMessage = "Ligação removida deste navegador.";
        paint();
        return;
      }
      if (linkAction === "save") {
        const name = root.querySelector<HTMLInputElement>("#ligacao-nome")?.value ?? "";
        const url = root.querySelector<HTMLInputElement>("#ligacao-url")?.value ?? "";
        linkDraft = { id: linkDraft.id, name, url };
        if (!name.trim()) {
          linkMessage = "Indique um nome.";
          paint();
          return;
        }
        if (!isHttpUrl(url)) {
          linkMessage = "O endereço tem de começar por http:// ou https://.";
          paint();
          return;
        }
        links = upsertLink(links, { id: linkDraft.id, name, url });
        saveLinks(localStorage, project.id, links);
        linkDraft = { id: "", name: "", url: "" };
        linkMessage = "Ligação guardada neste navegador.";
        paint();
      }
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
    links = loadLinks(localStorage, project.id);
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
  links: ExternalLink[];
  linkDraft: { id: string; name: string; url: string };
  linkMessage: string;
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
      ${state.section === "ligacoes" ? linksHtml(state.links, state.linkDraft, state.linkMessage) : ""}
    </main>
    <footer class="panel-footer">${where} · v${APP_VERSION}</footer>
  </div>`;
}

function linksHtml(
  links: ExternalLink[],
  draft: { id: string; name: string; url: string },
  message: string,
): string {
  const rows = links.map((link) => `<li data-testid="ligacao">
    <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.name)}</a>
    <button type="button" data-link-action="edit" data-link-id="${escapeHtml(link.id)}">Editar</button>
    <button type="button" data-link-action="delete" data-link-id="${escapeHtml(link.id)}">Remover</button>
  </li>`).join("");
  return `<section data-testid="seccao-ligacoes">
    <h2>Ligações</h2>
    <p class="muted">Endereços úteis deste projeto. Ficam neste navegador e abrem num separador novo.</p>
    ${rows ? `<ul class="link-list" data-testid="lista-ligacoes">${rows}</ul>` : `<p class="muted">Ainda não há ligações.</p>`}
    <label class="field">Nome
      <input id="ligacao-nome" data-testid="ligacao-nome" type="text" maxlength="80" value="${escapeHtml(draft.name)}" />
    </label>
    <label class="field">Endereço
      <input id="ligacao-url" data-testid="ligacao-url" type="url" value="${escapeHtml(draft.url)}" placeholder="https://" />
    </label>
    <button type="button" class="primary" data-link-action="save" data-testid="guardar-ligacao">${draft.id ? "Atualizar" : "Adicionar"}</button>
    ${message ? `<p class="feedback" data-testid="aviso-ligacao">${escapeHtml(message)}</p>` : ""}
  </section>`;
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
