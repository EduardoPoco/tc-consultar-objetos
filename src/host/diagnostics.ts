import { APP_VERSION } from "../domain/types";
import { escapeHtml } from "../ui/html";

export interface StartupDiagnostics {
  version: string;
  apiPackage: string;
  context: string;
  reportedHost: string;
  viewerProbe: string;
  menu: string;
  errors: string[];
}

const empty: StartupDiagnostics = {
  version: APP_VERSION,
  apiPackage: "0.3.38",
  context: "desconhecido",
  reportedHost: "não consultado",
  viewerProbe: "não consultado",
  menu: "não aplicável",
  errors: [],
};

let current = empty;

export function setDiagnostics(value: StartupDiagnostics): void {
  current = value;
}

export function getDiagnostics(): StartupDiagnostics {
  return current;
}

export function diagnosticsHtml(): string {
  const info = getDiagnostics();
  const errors = info.errors.length === 0
    ? "nenhum"
    : info.errors.map((error) => escapeHtml(error)).join("<br />");
  return `<div class="diagnostics" data-testid="diagnostico">
    <h2>Diagnóstico</h2>
    <dl class="facts">
      <div><dt>Versão</dt><dd>${escapeHtml(info.version)}</dd></div>
      <div><dt>Workspace API</dt><dd>${escapeHtml(info.apiPackage)}</dd></div>
      <div><dt>Contexto</dt><dd>${escapeHtml(info.context)}</dd></div>
      <div><dt>extension.getHost</dt><dd>${escapeHtml(info.reportedHost)}</dd></div>
      <div><dt>Painel do visualizador</dt><dd>${escapeHtml(info.viewerProbe)}</dd></div>
      <div><dt>Menu do projeto</dt><dd>${escapeHtml(info.menu)}</dd></div>
      <div><dt>Erros</dt><dd>${errors}</dd></div>
    </dl>
  </div>`;
}
