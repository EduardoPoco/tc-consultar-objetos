import { APP_VERSION } from "./domain/types";
import { createHost } from "./host/createHost";
import { setDiagnostics, type StartupDiagnostics } from "./host/diagnostics";
import { createDemoProjectSource, createTrimbleProjectSource, commandFromEvent, PROJECT_COMMANDS, registerProjectMenu } from "./host/projectHost";
import { createTrimbleHost, connectionFailureHost } from "./host/trimbleHost";
import { connectWorkspace, detectHost } from "./host/workspaceConnection";
import { startApp } from "./ui/app";
import { startProjectPage } from "./ui/projectPage";
import "./styles.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Elemento #app em falta.");

const params = new URLSearchParams(window.location.search);
const contexto = params.get("contexto");
let embedded = false;
try {
  embedded = window.parent !== window;
} catch {
  embedded = true;
}

const demoProject = !embedded && (params.has("projeto") || contexto === "projeto");
const demoViewer = !embedded || params.has("demo");

if (demoProject) {
  setDiagnostics(demoInfo("demonstração · projeto"));
  await startProjectPage(root, createDemoProjectSource(params.get("nome")));
} else if (demoViewer) {
  setDiagnostics(demoInfo("demonstração · 3dviewer"));
  await startApp(root, await createHost());
} else {
  root.innerHTML = '<p class="boot">A ligar ao Trimble Connect…</p>';
  try {
    const connection = await connectWorkspace();
    const menuPromise = registerProjectMenu(connection);
    let reported = "não consultado";
    let probe = "não consultado";
    let kind: "project" | "3dviewer" = contexto === "projeto" ? "project" : "3dviewer";
    const errors: string[] = [];
    if (contexto !== "projeto" && contexto !== "3dviewer") {
      try {
        const detected = await detectHost(connection);
        kind = detected.kind;
        reported = detected.reported;
        probe = detected.probe;
      } catch (error) {
        kind = "3dviewer";
        errors.push(error instanceof Error ? error.message : "A deteção do contexto falhou.");
      }
    }
    const menu = await menuPromise.catch((error: unknown) => error instanceof Error ? error.message : "setMenu falhou");
    if (menu !== "ok") errors.push(menu);
    setDiagnostics({
      version: APP_VERSION,
      apiPackage: "0.3.38",
      context: kind,
      reportedHost: reported,
      viewerProbe: probe,
      menu,
      errors,
    });
    if (kind === "project") {
      await startProjectPage(root, createTrimbleProjectSource(connection));
    } else {
      await startApp(root, await createTrimbleHost(connection));
      if (reported === "project") {
        connection.subscribe((event, data) => {
          if (event !== "extension.command") return;
          const command = commandFromEvent(data);
          if (!PROJECT_COMMANDS.includes(command as typeof PROJECT_COMMANDS[number])) return;
          void startProjectPage(root, createTrimbleProjectSource(connection));
        });
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Tempo esgotado.";
    errorsFallback(detail);
    await startApp(root, connectionFailureHost(`Não foi possível ligar ao Trimble Connect. ${detail}`));
  }
}

function demoInfo(context: string): StartupDiagnostics {
  return {
    version: APP_VERSION,
    apiPackage: "0.3.38",
    context,
    reportedHost: "não consultado",
    viewerProbe: "não consultado",
    menu: "não aplicável",
    errors: [],
  };
}

function errorsFallback(detail: string): void {
  setDiagnostics({
    version: APP_VERSION,
    apiPackage: "0.3.38",
    context: "ligação falhou",
    reportedHost: "não consultado",
    viewerProbe: "não consultado",
    menu: "não chamado",
    errors: [detail],
  });
}
