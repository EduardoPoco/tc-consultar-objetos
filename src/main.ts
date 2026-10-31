import { createHost } from "./host/createHost";
import { startApp } from "./ui/app";
import "./styles.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Elemento #app em falta.");

const params = new URLSearchParams(window.location.search);
let embedded = false;
try {
  embedded = window.parent !== window;
} catch {
  embedded = true;
}
if (!params.has("demo") && embedded) {
  root.innerHTML = '<p class="boot">A ligar ao Trimble Connect…</p>';
}

const host = await createHost();
await startApp(root, host);
