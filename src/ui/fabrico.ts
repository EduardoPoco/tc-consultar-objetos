import {
  defaultKeyColumn,
  suggestField,
  type KeyProperty,
  type SavedMapping,
  type SheetColumn,
  type SheetTable,
} from "../domain/fabric";
import { propertyKey } from "../domain/properties";
import type { PropItem } from "../domain/types";
import { escapeHtml } from "./html";

export function fabricoDetailHtml(table: SheetTable, properties: PropItem[], mappings: SavedMapping[]): string {
  const available = properties.length > 0 ? properties : [{
    key: "Identificação||Conjunto",
    setName: "Identificação",
    name: "Conjunto",
    label: "Conjunto",
  }];
  const keyColumn = defaultKeyColumn(table.columns);
  const keyProperty = defaultKeyProperty(available);
  const saved = mappings.find((mapping) => mapping.headerRow === table.headerRow
    && table.columns.some((column) => column.name === mapping.keyColumnName));
  const chosenKey = saved
    ? table.columns.find((column) => column.name === saved.keyColumnName)?.index ?? keyColumn
    : keyColumn;
  const chosenProperty = saved ? propertyKey(saved.keyProperty.setName, saved.keyProperty.name) : keyProperty;
  return `<div class="fabric-map">
    <p class="source">Folha «${escapeHtml(table.sheetName)}», cabeçalho na linha ${table.headerRow}. ${table.rows.length} linhas de dados, ${table.columns.length} colunas.</p>
    <div class="color-row">
      <label class="field">Coluna chave
        <select id="coluna-chave" data-testid="coluna-chave">
          ${table.columns.map((column) => `<option value="${column.index}" ${column.index === chosenKey ? "selected" : ""}>${escapeHtml(column.name)}</option>`).join("")}
        </select>
      </label>
      <label class="field">Propriedade do modelo
        <select id="propriedade-chave" data-testid="propriedade-chave">
          ${available.map((item) => `<option value="${escapeHtml(item.key)}" ${item.key === chosenProperty ? "selected" : ""}>${escapeHtml(item.setName ? `${item.setName} / ${item.name}` : item.name)}</option>`).join("")}
        </select>
      </label>
    </div>
    <label class="search">Filtrar colunas
      <input id="filtrar-colunas" data-testid="filtrar-colunas" type="search" placeholder="Corte, perfil, %" />
    </label>
    <div class="table-scroll map-scroll">
      <table class="map-table" data-testid="tabela-mapeamento">
        <thead><tr><th></th><th>Coluna do Excel</th><th>No modelo</th></tr></thead>
        <tbody>
          ${table.columns.map((column) => mappingRow(column, saved)).join("")}
        </tbody>
      </table>
    </div>
    <label class="field">Nome do mapeamento
      <input id="nome-mapeamento" data-testid="nome-mapeamento" type="text" maxlength="80" value="${escapeHtml(saved?.name ?? "Fabrico")}" />
    </label>
    <div class="actions">
      <button type="button" class="primary" data-action="apply-import" data-testid="aplicar-importacao">Aplicar importação</button>
      <button type="button" data-action="save-mapping" data-testid="guardar-mapeamento">Guardar mapeamento</button>
      <button type="button" class="ghost" data-action="clear-import" data-testid="limpar-fabrico">Limpar dados</button>
    </div>
  </div>`;
}

function mappingRow(column: SheetColumn, saved: SavedMapping | undefined): string {
  const link = saved?.columns.find((item) => item.columnName === column.name);
  const checked = link ? true : saved ? false : suggestField(column);
  const setName = link?.setName ?? "Fabrico";
  const propertyName = link?.propertyName ?? column.name;
  return `<tr data-column-name="${escapeHtml(column.name)}">
    <td><input type="checkbox" data-import-col="${column.index}" aria-label="Importar ${escapeHtml(column.name)}" ${checked ? "checked" : ""} /></td>
    <td>${escapeHtml(column.name)}${column.samples[0] ? `<small>${escapeHtml(column.samples[0])}</small>` : ""}</td>
    <td class="dest">
      <input data-pset="${column.index}" aria-label="Conjunto de ${escapeHtml(column.name)}" value="${escapeHtml(setName)}" />
      <input data-prop="${column.index}" aria-label="Propriedade de ${escapeHtml(column.name)}" value="${escapeHtml(propertyName)}" />
    </td>
  </tr>`;
}

function defaultKeyProperty(properties: PropItem[]): string {
  return properties.find((item) => item.name.toLowerCase() === "conjunto")?.key
    ?? properties.find((item) => item.name.toLowerCase() === "marca")?.key
    ?? properties[0]?.key
    ?? "";
}

export interface FabricForm {
  keyColumn: number;
  keyProperty: KeyProperty;
  fields: Array<{ column: number; setName: string; propertyName: string; columnName: string }>;
  mappingName: string;
}

export function readFabricForm(root: ParentNode, table: SheetTable): FabricForm | null {
  const keyColumn = Number((root.querySelector<HTMLSelectElement>("#coluna-chave")?.value ?? ""));
  const keyValue = root.querySelector<HTMLSelectElement>("#propriedade-chave")?.value ?? "";
  const keyProperty = propertiesByKey(keyValue);
  if (!Number.isFinite(keyColumn) || !keyProperty) return null;
  const fields = table.columns.flatMap((column) => {
    const box = root.querySelector<HTMLInputElement>(`input[data-import-col="${column.index}"]`);
    if (!box?.checked) return [];
    const setName = root.querySelector<HTMLInputElement>(`input[data-pset="${column.index}"]`)?.value.trim() || "Fabrico";
    const propertyName = root.querySelector<HTMLInputElement>(`input[data-prop="${column.index}"]`)?.value.trim() || column.name;
    return [{ column: column.index, setName, propertyName, columnName: column.name }];
  });
  return {
    keyColumn,
    keyProperty,
    fields,
    mappingName: root.querySelector<HTMLInputElement>("#nome-mapeamento")?.value.trim() || "Fabrico",
  };
}

function propertiesByKey(value: string): KeyProperty | null {
  const split = value.split("||");
  if (split.length < 2 || !split[1]) return null;
  return { setName: split[0], name: split.slice(1).join("||") };
}

export function filterMappingRows(root: ParentNode, query: string): void {
  const needle = query.trim().toLowerCase();
  root.querySelectorAll<HTMLTableRowElement>("#fabrico-mapa tbody tr").forEach((row) => {
    const name = row.dataset.columnName?.toLowerCase() ?? "";
    row.hidden = needle !== "" && !name.includes(needle);
  });
}

export function reportHtml(report: {
  rowCount: number;
  rowsWithoutKey: number;
  matchedObjects: number;
  unmatchedCount: number;
  unmatchedKeys: string[];
  objectsWithoutRowCount: number;
  objectsWithoutRow: string[];
  duplicateKeys: number;
} | null, fileName: string): string {
  if (!report) return "";
  return `<section class="report" data-testid="relatorio">
    <h2>Relatório de correspondência</h2>
    <p>${escapeHtml(fileName)}</p>
    <ul>
      <li data-testid="linhas-folha">${report.rowCount} linhas na folha${report.rowsWithoutKey ? `, ${report.rowsWithoutKey} sem chave` : ""}</li>
      <li data-testid="objetos-ligados">${report.matchedObjects} objetos com linha</li>
      <li data-testid="linhas-sem-objeto">${report.unmatchedCount} linhas sem objeto${report.unmatchedKeys.length ? `: ${escapeHtml(report.unmatchedKeys.join(", "))}` : ""}</li>
      <li data-testid="objetos-sem-linha">${report.objectsWithoutRowCount} objetos sem linha${report.objectsWithoutRow.length ? `: ${escapeHtml(report.objectsWithoutRow.join(", "))}` : ""}</li>
      <li>${report.duplicateKeys} chaves repetidas (fica a linha de tipo Conjunto, se existir)</li>
    </ul>
  </section>`;
}
