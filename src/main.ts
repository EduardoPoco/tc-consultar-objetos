import { createHost } from "./host/createHost";
import { createDemoProjectSource, createTrimbleProjectSource } from "./host/projectHost";
import { createTrimbleHost } from "./host/trimbleHost";
import { connectionFailureHost } from "./host/trimbleHost";
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

if (params.has("projeto") || contexto === "projeto") {
  await startProjectPage(root, createDemoProjectSource(params.get("nome")));
} else if (contexto === "3dviewer" || params.has("demo") || !embedded) {
  const host = await createHost();
  await startApp(root, host);
} else {
  root.innerHTML = '<p class="boot">A ligar ao Trimble Connect…</p>';
  try {
    const connection = await connectWorkspace();
    let kind: "project" | "3dviewer" = "3dviewer";
    try {
      kind = await detectHost(connection);
    } catch {
      kind = "3dviewer";
    }
    if (kind === "project") {
      await startProjectPage(root, createTrimbleProjectSource(connection));
    } else {
      await startApp(root, await createTrimbleHost(connection));
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Tempo esgotado.";
    await startApp(root, connectionFailureHost(`Não foi possível ligar ao Trimble Connect. ${detail}`));
  }
}
