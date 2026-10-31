import { APP_VERSION } from "../domain/types";
import type { ProjectDetails, ProjectUser } from "../domain/project";
import type { ProjectPageSource } from "../host/projectTypes";
import { escapeHtml } from "./html";

const SECTIONS = [{ id: "projeto", label: "Projeto" }] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export async function startProjectPage(root: HTMLElement, source: ProjectPageSource): Promise<void> {
  let section: SectionId = "projeto";
  let project: ProjectDetails | null = null;
  let user: ProjectUser | null = null;
  let error = "";

  const paint = () => {
    root.innerHTML = pageHtml(source.mode, section, project, user, error);
  };

  source.onCommand((command) => {
    if (SECTIONS.some((item) => item.id === command)) {
      section = command as SectionId;
      void source.activateMenu(command);
      paint();
    }
  });

  paint();
  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const command = target.closest<HTMLElement>("[data-command]")?.dataset.command;
    if (!command || !SECTIONS.some((item) => item.id === command)) return;
    section = command as SectionId;
    void source.activateMenu(command);
    paint();
  });

  try {
    const loaded = await source.load();
    project = loaded.project;
    user = loaded.user;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Não foi possível ler o projeto.";
  }
  paint();
}

function pageHtml(
  mode: ProjectPageSource["mode"],
  section: SectionId,
  project: ProjectDetails | null,
  user: ProjectUser | null,
  error: string,
): string {
  const icon = `${import.meta.env.BASE_URL}icon.svg`;
  const where = mode === "demo" ? "Modo de demonstração" : "Ligado ao Trimble Connect";
  return `<div class="project-page" data-mode="${mode}">
    <header class="project-header">
      <img src="${icon}" alt="" width="40" height="40" />
      <div>
        <h1>Consultar Objetos</h1>
        <p>Página do projeto</p>
      </div>
    </header>
    <p class="project-note">No Trimble Connect este atalho fica no menu da esquerda, junto de Shared Model e ToDo. Aqui os mesmos destinos estão nesta barra.</p>
    <nav class="project-nav" aria-label="Secções do projeto" data-testid="menu-projeto">
      ${SECTIONS.map((item) => `<button type="button" data-command="${item.id}" class="${item.id === section ? "is-active" : ""}" aria-current="${item.id === section ? "page" : "false"}">${item.label}</button>`).join("")}
    </nav>
    <main class="project-main">
      ${error ? `<p class="banner" role="alert">${escapeHtml(error)}</p>` : ""}
      ${section === "projeto" ? infoHtml(project, user) : ""}
    </main>
    <footer class="panel-footer">${where} · v${APP_VERSION}</footer>
  </div>`;
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
