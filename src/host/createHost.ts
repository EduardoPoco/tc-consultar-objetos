import { createDemoHost } from "../demo/demoHost";
import type { ViewerHost } from "./types";
import { connectionFailureHost, createTrimbleHost } from "./trimbleHost";

export async function createHost(): Promise<ViewerHost> {
  const params = new URLSearchParams(window.location.search);
  if (params.has("demo") || !isEmbedded()) {
    return createDemoHost({ dataTable: !params.has("semTabela") });
  }
  try {
    return await createTrimbleHost();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Tempo esgotado.";
    return connectionFailureHost(`Não foi possível ligar ao Trimble Connect. ${detail}`);
  }
}

function isEmbedded(): boolean {
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
}
