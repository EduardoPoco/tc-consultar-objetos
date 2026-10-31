import { buildInquiryTable, columnHeading, inquiryTableToCsv, sortInquiryTable } from "../domain/table";
import { applyFabrication, buildDataset, type FabricationDataset, type SavedMapping, type SheetTable } from "../domain/fabric";
import { planColors, type ColorScale, type LegendStop } from "../domain/palette";
import { clearDataset, loadDataset, loadMappings, saveDataset, saveMappings } from "../domain/fabricStore";
import { buildLabelText } from "../domain/labels";
import {
  columnsToItems,
  discoverItems,
  filterItems,
  findProperty,
  itemsForTable,
  sameKeys,
  sortItems,
} from "../domain/properties";
import { loadColumnSetChoice, loadSets, loadSettings, saveColumnSetChoice, saveSets, saveSettings, upsertSet } from "../domain/storage";
import {
  APP_VERSION,
  TABLE_PAGE_SIZE,
  type ColumnSet,
  type InquiredObject,
  type LabelSettings,
  type NamedPropertySet,
  type PropItem,
} from "../domain/types";
import { formatValue } from "../domain/format";
import { DEMO_MODEL_ID, type DemoPiece } from "../demo/fixtures";
import type { ViewerHost } from "../host/types";
import { isDemoHost } from "../host/types";
import { fabricoDetailHtml, filterMappingRows, readFabricForm, reportHtml } from "./fabrico";
import { escapeHtml, plural, setHtml } from "./html";
import { PROGRESS_DELAY_MS } from "../host/selectionGate";

declare global {
  interface Window {
    __consultar?: {
      emitSelection(runtimeIds: number[]): void;
      reads(): number;
    };
  }
}
import { readWorkbook } from "../domain/workbook";
type TabId = "consultar" | "tabela" | "definicoes" | "conjuntos" | "fabrico" | "cores" | "acerca";

interface UiState {
  tab: TabId;
  columnSets: ColumnSet[];
  activeSetName: string;
  dataTableAvailable: boolean;
  checked: Set<string>;
  sort: "asc" | "desc";
  filter: string;
  settings: LabelSettings;
  sets: NamedPropertySet[];
  labelsActive: boolean;
  feedback: string;
  projectId: string;
  dataset: FabricationDataset | null;
  table: SheetTable | null;
  buffer: ArrayBuffer | null;
  catalog: InquiredObject[];
  fileName: string;
  colorProperty: string;
  colorScale: ColorScale;
  legend: LegendStop[];
  tableSort: { index: number; direction: "asc" | "desc" } | null;
  tablePage: number;
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "consultar", label: "Consultar" },
  { id: "tabela", label: "Tabela" },
  { id: "definicoes", label: "Definições" },
  { id: "conjuntos", label: "Conjuntos" },
  { id: "fabrico", label: "Fabrico" },
  { id: "cores", label: "Cores" },
  { id: "acerca", label: "Acerca" },
];

const SEPARATORS = [
  { value: " | ", label: "|  (barra)" },
  { value: " · ", label: "·  (ponto)" },
  { value: ", ", label: ",  (vírgula)" },
  { value: " — ", label: "—  (travessão)" },
  { value: "; ", label: ";  (ponto e vírgula)" },
];

export async function startApp(root: HTMLElement, host: ViewerHost): Promise<void> {
  const ui: UiState = {
    tab: "consultar",
    columnSets: [],
    activeSetName: "",
    dataTableAvailable: false,
    checked: new Set(),
    sort: "asc",
    filter: "",
    settings: loadSettings(localStorage),
    sets: loadSets(localStorage),
    labelsActive: false,
    feedback: "",
    projectId: "demonstracao",
    dataset: null,
    table: null,
    buffer: null,
    catalog: [],
    fileName: "",
    colorProperty: "",
    colorScale: "auto",
    legend: [],
    tableSort: null,
    tablePage: 0,
  };
  ui.projectId = await host.projectId();
  ui.dataset = loadDataset(localStorage, ui.projectId);

  const columnInfo = await host.loadColumnSets();
  if (columnInfo && columnInfo.sets.length > 0) {
    ui.columnSets = columnInfo.sets;
    ui.dataTableAvailable = true;
  }
  const savedColumnSet = loadColumnSetChoice(localStorage);
  ui.activeSetName = savedColumnSet !== null && (savedColumnSet === "" || ui.columnSets.some((set) => set.name === savedColumnSet))
    ? savedColumnSet
    : "";

  if (isDemoHost(host)) {
    window.__consultar = {
      emitSelection(runtimeIds: number[]) {
        host.emitSelection([{ modelId: DEMO_MODEL_ID, objectRuntimeIds: runtimeIds }]);
      },
      reads: () => host.readCount(),
    };
  }

  root.innerHTML = shell(host);
  bind(root, host, ui);
  fillSettings(root, ui);

  let selectionKey = host.snapshot().selectionId;
  let wasLoading = host.snapshot().loading;
  let labeling = false;
  let relabel = false;
  let showProgress = false;
  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  let watchingLoad = false;

  const sync = () => paint(root, host, ui, showProgress);
  const trackLoad = (loading: boolean) => {
    if (loading) {
      if (watchingLoad) return;
      watchingLoad = true;
      showProgress = false;
      progressTimer = setTimeout(() => {
        progressTimer = undefined;
        showProgress = host.snapshot().loading;
        sync();
      }, PROGRESS_DELAY_MS);
      return;
    }
    if (!watchingLoad && !showProgress) return;
    watchingLoad = false;
    showProgress = false;
    if (progressTimer) clearTimeout(progressTimer);
    progressTimer = undefined;
  };
  host.subscribe(() => {
    const snapshot = host.snapshot();
    trackLoad(snapshot.loading);
    const selectionChanged = snapshot.selectionId !== selectionKey;
    if (selectionChanged) {
      selectionKey = snapshot.selectionId;
      ui.tablePage = 0;
    }
    const finished = wasLoading && !snapshot.loading;
    wasLoading = snapshot.loading;
    if (!snapshot.loading && ui.labelsActive && (selectionChanged || finished)) void refreshLabels();
    else sync();
  });
  sync();

  async function refreshLabels(): Promise<void> {
    if (!ui.labelsActive) return;
    if (labeling) {
      relabel = true;
      return;
    }
    labeling = true;
    try {
      do {
        relabel = false;
        if (!ui.labelsActive) break;
        const snapshot = host.snapshot();
        const objects = snapshot.objects.map((object) => applyFabrication(object, ui.dataset));
        const chosen = currentItems(ui, objects).filter((item) => ui.checked.has(item.key));
        const payloads = objects.flatMap((object) => {
          const text = buildLabelText(object, chosen, ui.settings);
          if (!text.trim()) return [];
          return [{
            modelId: object.modelId,
            runtimeId: object.runtimeId,
            text,
            color: ui.settings.labelColor,
            box: object.box,
            position: object.raw.position,
          }];
        });
        await host.showLabels(payloads);
        if (!ui.labelsActive) break;
        const placed = host.snapshot();
        if (payloads.length === 0) {
          ui.feedback = "Marque propriedades e selecione objetos para criar etiquetas.";
        } else if (placed.labelsCancelled) {
          ui.feedback = `Colocação cancelada. Foram colocadas etiquetas em ${plural(placed.labels.length, "objeto", "objetos")} de ${payloads.length}.`;
        } else {
          ui.feedback = `Etiquetas colocadas em ${plural(placed.labels.length, "objeto", "objetos")}. Guarde uma Vista no visualizador para as conservar.`;
        }
      } while (relabel && ui.labelsActive);
    } catch (error) {
      ui.feedback = error instanceof Error ? error.message : "Não foi possível criar as etiquetas.";
    } finally {
      labeling = false;
      sync();
    }
  }

  async function onShowLabels(): Promise<void> {
    ui.labelsActive = true;
    ui.feedback = "A colocar etiquetas…";
    await refreshLabels();
  }

  async function onClearLabels(): Promise<void> {
    ui.labelsActive = false;
    relabel = false;
    await host.clearLabels();
    ui.feedback = "Etiquetas removidas. As outras marcações do visualizador mantêm-se.";
    sync();
  }

  async function onIsolate(): Promise<void> {
    const objects = host.snapshot().objects;
    await host.isolate(objects, ui.settings.highlightColor);
    ui.feedback = objects.length === 0
      ? "Selecione objetos antes de isolar."
      : `${plural(objects.length, "objeto isolado e colorido", "objetos isolados e coloridos")}. Use Repor para mostrar outra vez o modelo.`;
    sync();
  }

  async function onReset(): Promise<void> {
    await host.resetAppearance();
    ui.legend = [];
    ui.feedback = "Visibilidade e cores repostas.";
    sync();
  }

  function onExport(): void {
    const objects = host.snapshot().objects.map((object) => applyFabrication(object, ui.dataset));
    const columns = visibleRows(ui, objects);
    if (objects.length === 0 || columns.length === 0) {
      ui.feedback = "Nada para exportar. Selecione objetos e, se quiser, filtre as propriedades.";
      sync();
      return;
    }
    const table = presentedTable(objects, columns, ui);
    downloadCsv(inquiryTableToCsv(table));
    ui.feedback = "CSV transferido. Separador «;» e codificação UTF-8, para o Excel em português.";
    sync();
  }

  function onSaveSet(): void {
    const input = root.querySelector<HTMLInputElement>("#set-name");
    const name = input?.value.trim() ?? "";
    if (!name) {
      ui.feedback = "Indique um nome para o conjunto.";
      sync();
      return;
    }
    if (ui.checked.size === 0) {
      ui.feedback = "Marque pelo menos uma propriedade antes de guardar.";
      sync();
      return;
    }
    ui.sets = upsertSet(ui.sets, name, [...ui.checked]);
    saveSets(localStorage, ui.sets);
    ui.feedback = `Conjunto «${name}» guardado neste navegador.`;
    sync();
  }

  function onApplySet(id: string): void {
    const set = ui.sets.find((item) => item.id === id);
    if (!set) return;
    ui.checked = new Set(set.keys);
    ui.feedback = `Conjunto «${set.name}» aplicado.`;
    if (ui.labelsActive) void refreshLabels();
    else sync();
  }

  function onDeleteSet(id: string): void {
    ui.sets = ui.sets.filter((item) => item.id !== id);
    saveSets(localStorage, ui.sets);
    ui.feedback = "Conjunto eliminado deste navegador.";
    sync();
  }

  function bind(scope: HTMLElement, viewer: ViewerHost, state: UiState): void {
    scope.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
      if (!action) return;
      if (action === "tab") {
        const tab = target.closest<HTMLElement>("[data-tab]")?.dataset.tab as TabId | undefined;
        if (tab) {
          state.tab = tab;
          if (tab === "cores" && state.catalog.length === 0) {
            void viewer.listAllObjects().then((objects) => {
              state.catalog = objects;
              sync();
            });
          }
          sync();
        }
        return;
      }
      if (action === "sort-table") {
        const index = Number(target.closest<HTMLElement>("[data-col]")?.dataset.col);
        if (Number.isFinite(index)) {
          const current = state.tableSort;
          state.tableSort = {
            index,
            direction: current?.index === index && current.direction === "asc" ? "desc" : "asc",
          };
          sync();
        }
        return;
      }
      if (action === "sort") {
        state.sort = state.sort === "asc" ? "desc" : "asc";
        sync();
        return;
      }
      if (action === "check-all") {
        for (const item of currentItems(state, viewer.snapshot().objects)) state.checked.add(item.key);
        if (state.labelsActive) void refreshLabels();
        else sync();
        return;
      }
      if (action === "check-none") {
        state.checked.clear();
        if (state.labelsActive) void refreshLabels();
        else sync();
        return;
      }
      if (action === "show-labels") void onShowLabels();
      if (action === "clear-labels") void onClearLabels();
      if (action === "isolate") void onIsolate();
      if (action === "reset") void onReset();
      if (action === "export") onExport();
      if (action === "save-set") onSaveSet();
      if (action === "apply-set") onApplySet(target.closest<HTMLElement>("[data-id]")?.dataset.id ?? "");
      if (action === "delete-set") onDeleteSet(target.closest<HTMLElement>("[data-id]")?.dataset.id ?? "");
      if (action === "refresh-columns") {
        void viewer.loadColumnSets().then((info) => {
          if (!info) {
            state.dataTableAvailable = false;
            state.columnSets = [];
            state.feedback = "A Tabela de dados não está disponível.";
          } else {
            state.dataTableAvailable = info.sets.length > 0;
            state.columnSets = info.sets;
            if (state.activeSetName && !info.sets.some((set) => set.name === state.activeSetName)) {
              state.activeSetName = "";
              saveColumnSetChoice(localStorage, "");
            }
            state.feedback = "Conjuntos de colunas atualizados.";
          }
          fillColumnSets(scope, state);
          sync();
        });
      }
      if (action === "select-clear" && isDemoHost(viewer)) viewer.clearSelection();
      if (action === "select-sample" && isDemoHost(viewer)) viewer.select([2, 1, 3], "set");
      if (action === "select-many" && isDemoHost(viewer)) viewer.selectMany();
      if (action === "apply-import") void onApplyImport();
      if (action === "save-mapping") onSaveMapping();
      if (action === "clear-import") onClearImport();
      if (action === "apply-colors") void onApplyColors();
      if (action === "cancel-load") viewer.cancelLoad();
      if (action === "table-page") {
        const direction = Number(target.closest<HTMLElement>("[data-dir]")?.dataset.dir);
        if (Number.isFinite(direction)) {
          state.tablePage = Math.max(0, state.tablePage + direction);
          sync();
        }
        return;
      }
      if (action === "piece" && isDemoHost(viewer)) {
        const id = Number(target.closest<HTMLElement>("[data-runtime-id]")?.dataset.runtimeId);
        if (!Number.isFinite(id)) return;
        const mouse = event as MouseEvent;
        viewer.select([id], mouse.ctrlKey || mouse.metaKey ? "toggle" : "set");
      }
    });

    scope.addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement;
      if (target.matches("[data-key]")) {
        const key = target.dataset.key ?? "";
        if (target.checked) state.checked.add(key);
        else state.checked.delete(key);
        if (state.labelsActive) void refreshLabels();
        else sync();
        return;
      }
      if (target.id === "column-set") {
        state.activeSetName = target.value;
        saveColumnSetChoice(localStorage, state.activeSetName);
        sync();
        return;
      }
      if (target.name === "layout" && (target.value === "horizontal" || target.value === "vertical")) {
        state.settings = { ...state.settings, layout: target.value };
        saveSettings(localStorage, state.settings);
        if (state.labelsActive) void refreshLabels();
        return;
      }
      if (target.id === "separator") {
        state.settings = { ...state.settings, separator: target.value };
        saveSettings(localStorage, state.settings);
        if (state.labelsActive) void refreshLabels();
        return;
      }
      if (target.id === "show-units" || target.id === "show-name" || target.id === "show-property") {
        state.settings = {
          ...state.settings,
          showUnits: (scope.querySelector<HTMLInputElement>("#show-units")?.checked ?? true),
          showPropertyName: (scope.querySelector<HTMLInputElement>("#show-property")?.checked ?? false),
          showObjectName: (scope.querySelector<HTMLInputElement>("#show-name")?.checked ?? false),
        };
        saveSettings(localStorage, state.settings);
        if (state.labelsActive) void refreshLabels();
        else sync();
      }
      if (target.id === "label-color" || target.id === "highlight-color") {
        updateColors(scope, state);
        if (state.labelsActive) void refreshLabels();
        else sync();
      }
      if (target.id === "ficheiro-fabrico" && target.files?.[0]) void onFabricFile(target.files[0]);
      if (target.id === "linha-cabecalho") void reparseFabric(Number(target.value));
      if (target.id === "propriedade-cor") state.colorProperty = target.value;
      if (target.id === "modo-cor" && (target.value === "auto" || target.value === "categories" || target.value === "gradient")) {
        state.colorScale = target.value;
      }
    });

    scope.addEventListener("input", (event) => {
      const target = event.target as HTMLInputElement;
      if (target.id === "search") {
        state.filter = target.value;
        paintTable(scope, state, viewer.snapshot().objects.map((object) => applyFabrication(object, state.dataset)));
        return;
      }
      if (target.id === "label-color" || target.id === "highlight-color") {
        updateColors(scope, state);
        const swatch = scope.querySelector<HTMLElement>("#highlight-swatch");
        if (swatch) swatch.style.background = state.settings.highlightColor;
      }
      if (target.id === "filtrar-colunas") filterMappingRows(scope, target.value);
    });
  }

  async function onFabricFile(file: File): Promise<void> {
    ui.fileName = file.name;
    ui.buffer = await file.arrayBuffer();
    ui.catalog = await host.listAllObjects();
    ui.table = readWorkbook(ui.buffer);
    const header = root.querySelector<HTMLInputElement>("#linha-cabecalho");
    if (header) header.value = String(ui.table.headerRow);
    const map = root.querySelector("#fabrico-mapa");
    if (map) map.innerHTML = fabricoDetailHtml(ui.table, discoverItems(ui.catalog), loadMappings(localStorage));
    sync();
  }

  function reparseFabric(headerRow: number): void {
    if (!ui.buffer) return;
    ui.table = readWorkbook(ui.buffer, headerRow > 0 ? headerRow : undefined);
    const header = root.querySelector<HTMLInputElement>("#linha-cabecalho");
    if (header && document.activeElement !== header) header.value = String(ui.table.headerRow);
    const map = root.querySelector("#fabrico-mapa");
    if (map) map.innerHTML = fabricoDetailHtml(ui.table, discoverItems(ui.catalog), loadMappings(localStorage));
    sync();
  }

  async function onApplyImport(): Promise<void> {
    if (!ui.table) return;
    const form = readFabricForm(root, ui.table);
    if (!form) return;
    if (ui.catalog.length === 0) ui.catalog = await host.listAllObjects();
    try {
      ui.dataset = buildDataset({
        table: ui.table,
        keyColumn: form.keyColumn,
        keyProperty: form.keyProperty,
        fields: form.fields,
        objects: ui.catalog,
        projectId: ui.projectId,
        fileName: ui.fileName || ui.table.sheetName,
      });
      saveDataset(localStorage, ui.dataset);
      ui.feedback = "Dados de fabrico aplicados neste navegador.";
    } catch (error) {
      ui.feedback = error instanceof Error ? error.message : "Não foi possível guardar a importação.";
    }
    sync();
  }

  function onSaveMapping(): void {
    if (!ui.table) return;
    const form = readFabricForm(root, ui.table);
    if (!form) return;
    const column = ui.table.columns.find((item) => item.index === form.keyColumn);
    const mapping: SavedMapping = {
      id: globalThis.crypto?.randomUUID?.() ?? `mapa-${Date.now()}`,
      name: form.mappingName,
      headerRow: ui.table.headerRow,
      keyColumnName: column?.name ?? "",
      keyProperty: form.keyProperty,
      columns: form.fields.map((field) => ({
        columnName: field.columnName,
        setName: field.setName,
        propertyName: field.propertyName,
      })),
    };
    const mappings = loadMappings(localStorage).filter((item) => item.name !== mapping.name);
    saveMappings(localStorage, [...mappings, mapping]);
    ui.feedback = `Mapeamento «${mapping.name}» guardado neste navegador.`;
    sync();
  }

  async function onApplyColors(): Promise<void> {
    if (ui.catalog.length === 0) ui.catalog = await host.listAllObjects();
    const objects = ui.catalog.map((object) => applyFabrication(object, ui.dataset));
    const items = currentItems(ui, objects);
    const item = items.find((entry) => entry.key === ui.colorProperty) ?? items[0];
    if (!item) {
      ui.feedback = "Não há propriedades para colorir. Importe o Excel ou selecione objetos.";
      sync();
      return;
    }
    ui.colorProperty = item.key;
    const plan = planColors(objects, item, ui.colorScale);
    ui.legend = plan.legend;
    await host.colorByObject(plan.colors);
    ui.feedback = plan.scale === "gradient"
      ? "Modelo colorido com gradiente. Use Repor para voltar às cores originais."
      : "Modelo colorido por categoria. Use Repor para voltar às cores originais.";
    sync();
  }

  function onClearImport(): void {
    clearDataset(localStorage, ui.projectId);
    ui.dataset = null;
    ui.feedback = "Dados de fabrico removidos deste navegador.";
    sync();
  }
}

function updateColors(root: HTMLElement, state: UiState): void {
  const labelColor = root.querySelector<HTMLInputElement>("#label-color")?.value ?? state.settings.labelColor;
  const highlightColor = root.querySelector<HTMLInputElement>("#highlight-color")?.value ?? state.settings.highlightColor;
  state.settings = { ...state.settings, labelColor, highlightColor };
  saveSettings(localStorage, state.settings);
  const swatch = root.querySelector<HTMLElement>("#highlight-swatch");
  if (swatch) swatch.style.background = highlightColor;
}

function currentItems(state: UiState, objects: InquiredObject[]): PropItem[] {
  const columnSet = state.activeSetName
    ? state.columnSets.find((item) => item.name === state.activeSetName)
    : undefined;
  const base = columnSet ? columnsToItems(columnSet.columns) : discoverItems(objects);
  const imported = discoverItems(objects).filter((item) => state.dataset?.records.some((record) =>
    record.values.some((value) => value.setName === item.setName && value.name === item.name))
    && !base.some((existing) => existing.key === item.key));
  return sortItems([...base, ...imported], state.sort);
}

function visibleRows(state: UiState, objects: InquiredObject[]): PropItem[] {
  return filterItems(itemsForTable(currentItems(state, objects), state.checked), objects, state.filter, state.settings.showUnits);
}

function paint(root: HTMLElement, host: ViewerHost, state: UiState, showProgress: boolean): void {
  const snapshot = host.snapshot();
  const objects = snapshot.objects.map((object) => applyFabrication(object, state.dataset));
  const items = currentItems(state, objects);
  paintTabs(root, state.tab);
  paintBanner(root, snapshot.error, snapshot.connectionFailed);
  paintProgress(root, snapshot, showProgress);
  paintSource(root, state, snapshot.objects.length);
  paintChecklist(root, items, state.checked, snapshot.loading, objects, host.mode);
  paintActions(root, state, snapshot.objects.length, snapshot.isolated, snapshot.labels.length);
  paintTable(root, state, objects);
  const report = root.querySelector("#fabrico-relatorio");
  if (report) report.innerHTML = reportHtml(state.dataset?.report ?? null, state.dataset?.fileName ?? "");
  paintColorControls(root, state);
  paintSets(root, state);
  paintPieces(root, host);
  paintFooter(root, host.mode, snapshot);
  const feedback = root.querySelector("#feedback");
  if (feedback) feedback.textContent = state.feedback;
  const count = root.querySelector("#selection-count");
  if (count) {
    count.textContent = snapshot.objects.length === 0
      ? "Nenhum objeto na consulta"
      : `${plural(snapshot.objects.length, "objeto na consulta", "objetos na consulta")} · ${plural(state.checked.size, "propriedade marcada", "propriedades marcadas")}`;
  }
}

function paintColorControls(root: HTMLElement, state: UiState): void {
  const select = root.querySelector<HTMLSelectElement>("#propriedade-cor");
  if (select && document.activeElement !== select) {
    const objects = state.catalog.map((object) => applyFabrication(object, state.dataset));
    const items = currentItems(state, objects);
    const preferred = items.find((item) => item.name.toLowerCase() === "corte · %")
      ?? items.find((item) => item.name.includes("%"))
      ?? items[0];
    const previous = state.colorProperty;
    select.innerHTML = items.map((item) => {
      const label = item.setName ? `${item.setName} / ${item.name}` : item.name;
      return `<option value="${escapeHtml(item.key)}">${escapeHtml(label)}</option>`;
    }).join("");
    const chosen = items.some((item) => item.key === previous) ? previous : preferred?.key ?? "";
    state.colorProperty = chosen;
    if (chosen) select.value = chosen;
  }
  const mode = root.querySelector<HTMLSelectElement>("#modo-cor");
  if (mode && document.activeElement !== mode) mode.value = state.colorScale;
  const legend = root.querySelector("#legenda");
  if (legend) {
    legend.innerHTML = state.legend.length === 0
      ? ""
      : `<h2>Legenda</h2><ul class="legend">${state.legend.map((stop) => `<li><span class="swatch" style="background:${escapeHtml(stop.color)}"></span>${escapeHtml(stop.label)}</li>`).join("")}</ul>`;
  }
}

function paintTabs(root: HTMLElement, tab: TabId): void {
  for (const item of TABS) {
    const button = root.querySelector<HTMLButtonElement>(`#tab-${item.id}`);
    const panel = root.querySelector<HTMLElement>(`#panel-${item.id}`);
    const selected = item.id === tab;
    button?.setAttribute("aria-selected", selected ? "true" : "false");
    button?.classList.toggle("is-active", selected);
    if (panel) panel.hidden = !selected;
  }
}

function paintBanner(root: HTMLElement, error: string, failed: boolean): void {
  const banner = root.querySelector("#banner");
  if (!banner) return;
  if (!error && !failed) {
    banner.innerHTML = "";
    return;
  }
  const demoLink = failed
    ? ' <a href="?demo=1">Abrir o modo de demonstração</a>.'
    : "";
  banner.innerHTML = `<p class="banner" role="alert">${escapeHtml(error)}${demoLink}</p>`;
}

function paintProgress(root: HTMLElement, snapshot: {
  loading: boolean;
  loadedCount: number;
  totalSelected: number;
  cancelled: boolean;
  objects: unknown[];
  labeling: boolean;
  labelsPlaced: number;
  labelsTotal: number;
  labelsCancelled: boolean;
}, showProgress: boolean): void {
  const slot = root.querySelector("#progresso");
  if (!slot) return;
  const showReading = snapshot.loading && showProgress;
  slot.classList.toggle("is-active", showReading);
  if (snapshot.loading) {
    setHtml(slot, showReading
      ? `<p class="progress" data-testid="progresso-leitura">A ler propriedades… ${snapshot.loadedCount} de ${snapshot.totalSelected}</p>
      <button type="button" data-action="cancel-load" data-testid="cancelar-leitura">Cancelar</button>`
      : "");
    return;
  }
  if (snapshot.labeling) {
    setHtml(slot, `<p class="progress" data-testid="progresso-etiquetas">A colocar etiquetas… ${snapshot.labelsPlaced} de ${snapshot.labelsTotal}</p>
      <button type="button" data-action="cancel-load" data-testid="cancelar-etiquetas">Cancelar</button>`);
    return;
  }
  if (snapshot.cancelled) {
    setHtml(slot, `<p class="warning">Leitura cancelada. Foram lidos ${snapshot.objects.length} de ${snapshot.totalSelected} objetos. O total da tabela refere-se aos objetos lidos.</p>`);
    return;
  }
  if (snapshot.labelsCancelled) {
    setHtml(slot, `<p class="warning" data-testid="progresso-etiquetas">Colocação de etiquetas cancelada. Foram colocadas ${snapshot.labelsPlaced} de ${snapshot.labelsTotal}.</p>`);
    return;
  }
  setHtml(slot, "");
}

function paintSource(root: HTMLElement, state: UiState, objectCount: number): void {
  const slot = root.querySelector("#source-line");
  if (!slot) return;
  if (!state.dataTableAvailable) {
    slot.textContent = "A Tabela de dados não está disponível. A lista vem das propriedades encontradas nos objetos. No Trimble Connect, crie um conjunto de colunas na Tabela de dados.";
    return;
  }
  if (state.activeSetName) {
    slot.textContent = objectCount === 0
      ? `Conjunto de colunas «${state.activeSetName}». Selecione objetos para ver os valores.`
      : `Conjunto de colunas «${state.activeSetName}».`;
    return;
  }
  slot.textContent = "Propriedades encontradas nos objetos selecionados.";
}

function paintChecklist(
  root: HTMLElement,
  items: PropItem[],
  checked: Set<string>,
  loading: boolean,
  objects: InquiredObject[],
  mode: ViewerHost["mode"],
): void {
  const slot = root.querySelector("#checklist");
  const empty = root.querySelector("#empty-selection");
  if (!slot || !empty) return;
  const objectCount = objects.length;
  if (loading && objectCount === 0) {
    setHtml(slot, "");
    empty.textContent = "";
    return;
  }
  if (items.length === 0) {
    setHtml(slot, "");
    empty.textContent = mode === "demo"
      ? "Selecione objetos no modelo. Neste modo de demonstração, clique nos elementos da planta. Ctrl+clique adiciona à seleção."
      : "Selecione objetos no visualizador 3D para consultar as propriedades.";
    return;
  }
  empty.textContent = objectCount === 0
    ? (mode === "demo"
      ? "Ainda não há objetos selecionados. Clique na planta à direita."
      : "Selecione objetos no visualizador para preencher os valores.")
    : "";
  const single = objectCount === 1 ? objects[0] : null;
  const markup = items.map((item) => {
    const meta = item.setName ? `${item.setName} / ${item.name}` : item.name;
    const on = checked.has(item.key);
    const property = single ? findProperty(single.raw, item) : undefined;
    const value = property ? formatValue(property, true) : (single ? "—" : "");
    return `<label class="check">
      <input type="checkbox" data-key="${escapeHtml(item.key)}" aria-label="${escapeHtml(meta)}" ${on ? "checked" : ""} />
      <span>
        <span class="check-label">${escapeHtml(item.label)}</span>
        ${item.label === meta ? "" : `<span class="check-meta">${escapeHtml(meta)}</span>`}
      </span>
      ${value ? `<span class="check-value">${escapeHtml(value)}</span>` : ""}
    </label>`;
  }).join("");
  setHtml(slot, markup);
}

function paintActions(root: HTMLElement, state: UiState, objectCount: number, isolated: boolean, labelCount: number): void {
  const show = root.querySelector<HTMLButtonElement>("#show-labels");
  const clear = root.querySelector<HTMLButtonElement>("#clear-labels");
  const isolate = root.querySelector<HTMLButtonElement>("#isolate");
  const reset = root.querySelector<HTMLButtonElement>("#reset");
  if (show) show.disabled = objectCount === 0 || state.checked.size === 0;
  if (clear) clear.disabled = !state.labelsActive && labelCount === 0;
  if (isolate) isolate.disabled = objectCount === 0;
  if (reset) reset.disabled = !isolated;
  const sort = root.querySelector("#ordenar");
  if (sort) sort.textContent = state.sort === "asc" ? "A–Z" : "Z–A";
}

function presentedTable(objects: InquiredObject[], columns: PropItem[], state: UiState) {
  const table = buildInquiryTable(objects, columns, state.settings.showUnits);
  if (!state.tableSort) return table;
  return sortInquiryTable(table, state.tableSort.index, state.tableSort.direction);
}

function paintTable(root: HTMLElement, state: UiState, objects: InquiredObject[]): void {
  const head = root.querySelector("#table-head");
  const body = root.querySelector("#table-body");
  const empty = root.querySelector("#table-empty");
  const table = root.querySelector<HTMLElement>("#table-scroll");
  if (!head || !body || !empty || !table) return;
  if (objects.length === 0) {
    setHtml(head, "");
    setHtml(body, "");
    table.hidden = true;
    empty.textContent = "Selecione objetos para preencher a tabela. Cada peça fica numa linha.";
    return;
  }
  const columns = visibleRows(state, objects);
  if (columns.length === 0) {
    setHtml(head, "");
    setHtml(body, "");
    table.hidden = true;
    empty.textContent = "Nenhuma propriedade corresponde à pesquisa.";
    return;
  }
  const inquiry = presentedTable(objects, columns, state);
  const pageCount = Math.max(1, Math.ceil(inquiry.rows.length / TABLE_PAGE_SIZE));
  const page = Math.min(state.tablePage, pageCount - 1);
  state.tablePage = page;
  const start = page * TABLE_PAGE_SIZE;
  const visible = inquiry.rows.slice(start, start + TABLE_PAGE_SIZE);
  const arrow = (index: number) => state.tableSort?.index === index ? (state.tableSort.direction === "asc" ? " ↑" : " ↓") : "";
  table.hidden = false;
  empty.textContent = inquiry.rows.length > TABLE_PAGE_SIZE
    ? `Página ${page + 1} de ${pageCount}. O total soma as ${inquiry.rows.length} peças, não só as linhas desta página.`
    : "";
  setHtml(head, `<tr>
    <th scope="col"><button type="button" data-action="sort-table" data-col="0">Peça${arrow(0)}</button></th>
    ${inquiry.columns.map((column, index) => `<th scope="col"><button type="button" data-action="sort-table" data-col="${index + 1}">${escapeHtml(columnHeading(column, inquiry.columns))}${arrow(index + 1)}</button></th>`).join("")}
  </tr>`);
  setHtml(body, `${visible.map((row) => `<tr data-testid="linha-objeto">
    <th scope="row">${escapeHtml(row.label)}</th>
    ${row.cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}
  </tr>`).join("")}
  <tr data-testid="linha-total" class="total-row">
    <th scope="row">Total · ${escapeHtml(inquiry.totalLabel)}</th>
    ${inquiry.totalCells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}
  </tr>`);
  const pager = root.querySelector("#table-pager");
  if (pager) {
    pager.innerHTML = inquiry.rows.length <= TABLE_PAGE_SIZE ? "" : `<div class="pager">
      <button type="button" data-action="table-page" data-dir="-1" ${page === 0 ? "disabled" : ""}>Anterior</button>
      <span>${start + 1}–${Math.min(start + TABLE_PAGE_SIZE, inquiry.rows.length)} de ${inquiry.rows.length}</span>
      <button type="button" data-action="table-page" data-dir="1" ${page >= pageCount - 1 ? "disabled" : ""}>Seguinte</button>
    </div>`;
  }
}

function paintSets(root: HTMLElement, state: UiState): void {
  const slot = root.querySelector("#sets-list");
  if (!slot) return;
  if (state.sets.length === 0) {
    slot.innerHTML = '<p class="muted">Ainda não há conjuntos guardados.</p>';
    return;
  }
  const checked = [...state.checked];
  slot.innerHTML = state.sets.map((set) => {
    const active = sameKeys(set.keys, checked);
    return `<article class="set-card${active ? " is-applied" : ""}" data-testid="conjunto">
      <header>
        <h3>${escapeHtml(set.name)}</h3>
        ${active ? '<span class="pill">Em uso</span>' : ""}
      </header>
      <p>${plural(set.keys.length, "propriedade", "propriedades")}</p>
      <div class="row">
        <button type="button" data-action="apply-set" data-id="${escapeHtml(set.id)}">Aplicar</button>
        <button type="button" class="ghost" data-action="delete-set" data-id="${escapeHtml(set.id)}">Eliminar</button>
      </div>
    </article>`;
  }).join("");
}

function paintPieces(root: HTMLElement, host: ViewerHost): void {
  if (!isDemoHost(host)) return;
  const plan = root.querySelector<HTMLElement>("#plan");
  if (!plan) return;
  const snapshot = host.snapshot();
  const selected = new Set(snapshot.objects.map((object) => object.runtimeId));
  plan.classList.toggle("is-isolated", snapshot.isolated);
  plan.querySelectorAll<HTMLElement>(".piece").forEach((piece) => {
    const id = Number(piece.dataset.runtimeId);
    const on = selected.has(id);
    const colored = snapshot.isolated && snapshot.isolatedRuntimeIds.includes(id);
    const hidden = snapshot.isolated && !snapshot.isolatedRuntimeIds.includes(id);
    const painted = snapshot.objectColors[`${DEMO_MODEL_ID}:${id}`];
    piece.classList.toggle("is-selected", on);
    piece.classList.toggle("is-colored", colored || Boolean(painted));
    piece.classList.toggle("is-hidden", hidden);
    piece.setAttribute("aria-pressed", on ? "true" : "false");
    if (painted) piece.style.background = painted;
    else if (colored && snapshot.highlightColor) piece.style.background = snapshot.highlightColor;
    else piece.style.removeProperty("background");
  });
  const badge = root.querySelector("#isolate-badge");
  if (badge) badge.textContent = snapshot.isolated ? "Objetos não consultados ocultados" : "";
  renderCallouts(plan, snapshot.labels);
}

function renderCallouts(plan: HTMLElement, labels: Array<{ runtimeId: number; text: string; color: string }>): void {
  const layer = plan.querySelector<HTMLElement>("#callouts");
  if (!layer) return;
  const draw = () => {
    const planRect = plan.getBoundingClientRect();
    layer.innerHTML = labels.map((label) => {
      const piece = plan.querySelector<HTMLElement>(`[data-runtime-id="${label.runtimeId}"]`);
      if (!piece) return "";
      const rect = piece.getBoundingClientRect();
      const side = piece.dataset.side ?? "right";
      let top = rect.top - planRect.top;
      let left = rect.right - planRect.left + 8;
      if (side === "left") {
        left = rect.left - planRect.left - 8;
      } else if (side === "up") {
        top = rect.top - planRect.top - 8;
        left = rect.left - planRect.left;
      } else if (side === "down") {
        top = rect.bottom - planRect.top + 8;
        left = rect.left - planRect.left;
      }
      return `<div class="callout ${escapeHtml(side)}" data-testid="etiqueta" style="top:${top}px;left:${left}px;color:${escapeHtml(label.color)}">${escapeHtml(label.text)}</div>`;
    }).join("");
  };
  requestAnimationFrame(draw);
}

function paintFooter(root: HTMLElement, mode: ViewerHost["mode"], snapshot: { loading: boolean }): void {
  const footer = root.querySelector("#footer");
  if (!footer) return;
  const where = mode === "demo" ? "Modo de demonstração" : "Ligado ao Trimble Connect";
  const loading = snapshot.loading ? " · a ler…" : "";
  footer.textContent = `${where}${loading} · v${APP_VERSION}`;
}

function fillSettings(root: HTMLElement, state: UiState): void {
  fillColumnSets(root, state);
  const label = root.querySelector<HTMLInputElement>("#label-color");
  const highlight = root.querySelector<HTMLInputElement>("#highlight-color");
  const separator = root.querySelector<HTMLSelectElement>("#separator");
  const units = root.querySelector<HTMLInputElement>("#show-units");
  const name = root.querySelector<HTMLInputElement>("#show-name");
  if (label) label.value = state.settings.labelColor;
  if (highlight) highlight.value = state.settings.highlightColor;
  if (separator) separator.value = state.settings.separator;
  if (units) units.checked = state.settings.showUnits;
  const propertyName = root.querySelector<HTMLInputElement>("#show-property");
  if (propertyName) propertyName.checked = state.settings.showPropertyName;
  if (name) name.checked = state.settings.showObjectName;
  const layout = root.querySelector<HTMLInputElement>(`input[name="layout"][value="${state.settings.layout}"]`);
  if (layout) layout.checked = true;
  const swatch = root.querySelector<HTMLElement>("#highlight-swatch");
  if (swatch) swatch.style.background = state.settings.highlightColor;
}

function fillColumnSets(root: HTMLElement, state: UiState): void {
  const select = root.querySelector<HTMLSelectElement>("#column-set");
  if (!select) return;
  const options = [`<option value="">Propriedades encontradas</option>`]
    .concat(state.columnSets.map((set) => `<option value="${escapeHtml(set.name)}">${escapeHtml(set.name)}</option>`));
  select.innerHTML = options.join("");
  select.value = state.activeSetName;
}

function downloadCsv(content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "consulta-objetos.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function shell(host: ViewerHost): string {
  const icon = `${import.meta.env.BASE_URL}icon.svg`;
  const stage = isDemoHost(host) ? demoStage(host.pieces()) : "";
  return `<div class="shell" data-mode="${host.mode}">
    <section class="panel" data-testid="painel">
      <header class="panel-header">
        <img src="${icon}" alt="" width="36" height="36" />
        <div>
          <h1>Consultar Objetos</h1>
          <p>Propriedades dos objetos selecionados</p>
        </div>
      </header>
      <div id="banner"></div>
      <nav class="tabs" role="tablist" aria-label="Secções">
        ${TABS.map((tab) => `<button type="button" class="tab${tab.id === "consultar" ? " is-active" : ""}" role="tab" id="tab-${tab.id}" data-action="tab" data-tab="${tab.id}" aria-selected="${tab.id === "consultar"}" aria-controls="panel-${tab.id}">${tab.label}</button>`).join("")}
      </nav>
      <div id="aviso" data-testid="aviso"></div>
      <div id="progresso"></div>
      <div id="panel-consultar" role="tabpanel" aria-labelledby="tab-consultar">
        <p id="source-line" class="source" data-testid="origem"></p>
        <div class="toolbar">
          <span id="selection-count" data-testid="contagem"></span>
          <span class="spacer"></span>
          <button type="button" id="ordenar" data-action="sort" data-testid="ordenar">A–Z</button>
          <button type="button" class="ghost" data-action="check-all" data-testid="marcar-todas">Marcar todas</button>
          <button type="button" class="ghost" data-action="check-none" data-testid="desmarcar">Desmarcar</button>
        </div>
        <div id="checklist" class="checklist" data-testid="lista"></div>
        <p id="empty-selection" class="muted"></p>
        <div class="actions">
          <button type="button" class="primary" id="show-labels" data-action="show-labels" data-testid="mostrar-etiquetas">Mostrar etiquetas</button>
          <button type="button" id="clear-labels" data-action="clear-labels" data-testid="limpar-etiquetas">Limpar etiquetas</button>
          <button type="button" id="isolate" data-action="isolate" data-testid="isolar">Isolar e colorir</button>
          <span id="highlight-swatch" class="swatch" title="Cor de realce"></span>
          <button type="button" class="ghost" id="reset" data-action="reset" data-testid="repor">Repor</button>
        </div>
        <p class="tip">Dica: as etiquetas são marcações do visualizador. Guarde uma Vista para as conservar.</p>
        <p id="feedback" class="feedback" data-testid="feedback" role="status"></p>
      </div>
      <div id="panel-tabela" role="tabpanel" aria-labelledby="tab-tabela" hidden>
        <div class="table-tools">
          <label class="search">Pesquisar
            <input id="search" data-testid="pesquisa" type="search" placeholder="Propriedade ou valor" />
          </label>
          <button type="button" class="primary" id="export" data-action="export" data-testid="exportar">Exportar CSV</button>
        </div>
        <p class="hint">Uma linha por peça e uma coluna por propriedade. A última linha soma todos os objetos selecionados. O CSV inclui o total. Clique no cabeçalho para ordenar.</p>
        <div id="table-pager"></div>
        <div id="table-scroll" class="table-scroll">
          <table data-testid="tabela">
            <thead id="table-head"></thead>
            <tbody id="table-body"></tbody>
          </table>
        </div>
        <p id="table-empty" class="muted"></p>
      </div>
      <div id="panel-definicoes" role="tabpanel" aria-labelledby="tab-definicoes" hidden>
        <label class="field">Conjunto de colunas da Tabela de dados
          <span class="inline">
            <select id="column-set" data-testid="conjunto-colunas"></select>
            <button type="button" data-action="refresh-columns" data-testid="atualizar-colunas">Atualizar</button>
          </span>
        </label>
        <div class="color-row">
          <label class="field">Cor das etiquetas
            <input id="label-color" data-testid="cor-etiqueta" type="color" value="#ffe14a" />
          </label>
          <label class="field">Cor de realce
            <input id="highlight-color" data-testid="cor-realce" type="color" value="#e07a1f" />
          </label>
        </div>
        <label class="field">Separador das propriedades na horizontal
          <select id="separator" data-testid="separador">
            ${SEPARATORS.map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join("")}
          </select>
        </label>
        <fieldset>
          <legend>Disposição das etiquetas</legend>
          <label class="radio"><input type="radio" name="layout" value="vertical" data-testid="disposicao-vertical" checked /> Vertical, uma propriedade por linha</label>
          <label class="radio"><input type="radio" name="layout" value="horizontal" data-testid="disposicao-horizontal" /> Horizontal, na mesma linha</label>
        </fieldset>
        <label class="check standalone"><input id="show-units" data-testid="mostrar-unidades" type="checkbox" checked /> Mostrar unidades (mm, m², m³, kg, °)</label>
        <label class="check standalone"><input id="show-property" data-testid="mostrar-propriedade" type="checkbox" /> Mostrar o nome da propriedade na etiqueta</label>
        <label class="check standalone"><input id="show-name" data-testid="mostrar-nome" type="checkbox" /> Mostrar o nome do objeto na etiqueta</label>
        <p class="hint">As etiquetas são colocadas em todos os objetos selecionados. Numa seleção grande, o visualizador recebe as marcações em lotes e a colocação pode ser cancelada.</p>
        <p class="tip">Dica: depois de colocar as etiquetas, guarde uma Vista no menu Views do Trimble Connect.</p>
      </div>
      <div id="panel-conjuntos" role="tabpanel" aria-labelledby="tab-conjuntos" hidden>
        <p class="hint">Guarde a lista de propriedades marcadas com um nome. Fica neste navegador, não no projeto. Exemplo: «Aço: perfil, material, peso».</p>
        <label class="field">Nome do conjunto
          <span class="inline">
            <input id="set-name" data-testid="nome-conjunto" type="text" maxlength="80" placeholder="Aço: perfil, material, peso" />
            <button type="button" class="primary" data-action="save-set" data-testid="guardar-conjunto">Guardar</button>
          </span>
        </label>
        <div id="sets-list" class="sets" data-testid="lista-conjuntos"></div>
      </div>
      <div id="panel-fabrico" role="tabpanel" aria-labelledby="tab-fabrico" hidden>
        <p class="hint">Importe um Excel ou CSV de fabrico. A coluna chave liga cada linha a um objeto (por exemplo Conjunto). Os valores ficam neste navegador, por projeto, e aparecem nas etiquetas e na tabela. Não são gravados no ficheiro do modelo.</p>
        <label class="field">Ficheiro
          <input id="ficheiro-fabrico" data-testid="ficheiro-fabrico" type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" />
        </label>
        <label class="field">Linha de cabeçalho
          <input id="linha-cabecalho" data-testid="linha-cabecalho" type="number" min="1" value="8" />
        </label>
        <div id="fabrico-relatorio"></div>
        <div id="fabrico-mapa"></div>
      </div>
      <div id="panel-cores" role="tabpanel" aria-labelledby="tab-cores" hidden>
        <p class="hint">Pinte o modelo segundo uma propriedade. Percentagens e datas usam um gradiente, do vermelho ao verde; o resto usa uma cor por categoria.</p>
        <label class="field">Propriedade
          <select id="propriedade-cor" data-testid="propriedade-cor"></select>
        </label>
        <label class="field">Escala
          <select id="modo-cor" data-testid="modo-cor">
            <option value="auto">Automático</option>
            <option value="categories">Categorias</option>
            <option value="gradient">Gradiente</option>
          </select>
        </label>
        <div class="actions">
          <button type="button" class="primary" data-action="apply-colors" data-testid="aplicar-cores">Aplicar cores</button>
          <button type="button" class="ghost" data-action="reset" data-testid="repor-cores">Repor</button>
        </div>
        <div id="legenda" data-testid="legenda"></div>
      </div>
      <div id="panel-acerca" role="tabpanel" aria-labelledby="tab-acerca" hidden>
        <div class="about">
          <p><strong>Consultar Objetos</strong> · versão ${APP_VERSION}</p>
          <p>Extensão do visualizador 3D do Trimble Connect para consultar peças do modelo: etiquetas junto dos objetos, tabela comparativa e CSV para aprovisionamento.</p>
          <p>Inspirada no Inquire Objects da Construsoft, sem depender dessa licença. Os conjuntos de propriedades e os dados de fabrico ficam guardados apenas neste navegador.</p>
          <ul>
            <li>As etiquetas são colocadas em todos os objetos selecionados, em lotes, com progresso e um botão para cancelar. Limpar etiquetas remove todas as que esta extensão criou.</li>
            <li>As unidades seguem a API: comprimentos em mm, áreas em m², volumes em m³, massas em kg.</li>
            <li>Fora do Trimble Connect abre um modelo de demonstração.</li>
          </ul>
        </div>
      </div>
      <footer id="footer" class="panel-footer"></footer>
    </section>
    ${stage}
  </div>`;
}

function demoStage(pieces: DemoPiece[]): string {
  const markup = pieces.map((piece) => `<button type="button" class="piece piece-${piece.kind}" data-action="piece" data-runtime-id="${piece.runtimeId}" data-side="${piece.side}" aria-label="${escapeHtml(piece.ariaLabel)}" aria-pressed="false" style="left:${piece.left};top:${piece.top};width:${piece.width};height:${piece.height}">
      <span class="kicker">${escapeHtml(piece.kicker)}</span>
      <strong>${escapeHtml(piece.short)}</strong>
    </button>`).join("");
  return `<section class="stage" data-testid="modelo">
    <div class="demo-bar">
      <div>
        <strong>Modelo de demonstração</strong>
        <span>Planta esquemática do Pavilhão A. No Trimble Connect esta zona é o visualizador 3D.</span>
      </div>
      <div class="demo-actions">
        <button type="button" data-action="select-clear" data-testid="limpar-selecao">Limpar seleção</button>
        <button type="button" data-action="select-sample" data-testid="selecionar-amostra">Viga e pilares</button>
        <button type="button" data-action="select-many" data-testid="selecionar-muitos">Selecionar 25 peças</button>
      </div>
    </div>
    <div class="plan-wrap">
      <div id="plan" class="plan" data-testid="planta">
        <p class="plan-caption">Pavilhão A · estrutura metálica e laje</p>
        <p id="isolate-badge" class="isolate-badge"></p>
        ${markup}
        <div id="callouts" class="callouts"></div>
      </div>
    </div>
  </section>`;
}
