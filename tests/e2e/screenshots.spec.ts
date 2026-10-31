import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const directories = [path.resolve("docs/imagens"), "/opt/cursor/artifacts"];

async function shot(page: Page, name: string): Promise<void> {
  for (const directory of directories) {
    fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, name) });
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?demo=1");
  await expect(page.getByRole("heading", { name: "Consultar Objetos" })).toBeVisible();
});

test("01 painel sem seleção", async ({ page }) => {
  await shot(page, "01-painel-vazio.png");
});

test("02 seleção com propriedades", async ({ page }) => {
  await page.getByRole("button", { name: "Viga V1" }).click();
  await expect(page.locator(".check-value", { hasText: "HEA200" })).toBeVisible();
  await shot(page, "02-selecao-com-propriedades.png");
});

test("03 escolher propriedades", async ({ page }) => {
  await page.getByRole("button", { name: "Viga V1" }).click();
  await page.getByRole("checkbox", { name: "Perfil / Nome" }).check();
  await page.getByRole("checkbox", { name: "Material / Grau" }).check();
  await page.getByRole("checkbox", { name: "Quantidades / Peso" }).check();
  await expect(page.getByTestId("contagem")).toContainText("3 propriedades marcadas");
  await shot(page, "03-escolher-propriedades.png");
});

test("04 etiquetas no modelo", async ({ page }) => {
  await page.getByRole("button", { name: "Viga V1" }).click();
  await page.getByRole("button", { name: "Laje L1" }).click({ modifiers: ["Control"] });
  await page.getByRole("checkbox", { name: "Material / Grau" }).check();
  await page.getByRole("checkbox", { name: "Quantidades / Peso" }).check();
  await page.getByTestId("mostrar-etiquetas").click();
  await expect(page.getByTestId("etiqueta")).toHaveCount(2);
  await page.getByRole("tab", { name: "Definições" }).click();
  await page.getByTestId("disposicao-horizontal").check();
  await expect(page.getByTestId("mostrar-propriedade")).not.toBeChecked();
  await expect(page.getByTestId("mostrar-nome")).not.toBeChecked();
  await expect(page.getByTestId("etiqueta").first()).toHaveText("S275JR | 253,8 kg");
  await shot(page, "04-etiquetas-no-modelo.png");
});

test("05 tabela com pesquisa e CSV", async ({ page }) => {
  await page.getByRole("button", { name: "Viga V1" }).click();
  await page.getByRole("button", { name: "Pilar P1" }).click({ modifiers: ["Control"] });
  await page.getByRole("tab", { name: "Tabela" }).click();
  await page.getByTestId("pesquisa").fill("peso");
  await expect(page.getByRole("cell", { name: /253,8 kg/ })).toBeVisible();
  await shot(page, "05-tabela-pesquisa-csv.png");
});

test("06 isolar e colorir", async ({ page }) => {
  await page.getByTestId("selecionar-amostra").click();
  await page.getByTestId("isolar").click();
  await expect(page.locator(".piece.is-colored")).toHaveCount(3);
  await shot(page, "06-isolar-e-colorir.png");
});

test("08 mapeamento de colunas", async ({ page }) => {
  await page.getByRole("tab", { name: "Fabrico" }).click();
  await page.getByTestId("ficheiro-fabrico").setInputFiles("tests/fixtures/fabrico-mini.xlsx");
  await page.getByTestId("filtrar-colunas").fill("Corte");
  await expect(page.getByTestId("tabela-mapeamento").getByText("Corte · Data", { exact: true })).toBeVisible();
  await shot(page, "08-mapeamento-colunas.png");
});

test("09 relatório de correspondência", async ({ page }) => {
  await page.getByRole("tab", { name: "Fabrico" }).click();
  await page.getByTestId("ficheiro-fabrico").setInputFiles("tests/fixtures/fabrico-mini.xlsx");
  await page.getByTestId("aplicar-importacao").click();
  await expect(page.getByTestId("relatorio")).toContainText("Laje L1");
  await shot(page, "09-relatorio-correspondencia.png");
});

test("10 cores com legenda", async ({ page }) => {
  await page.getByRole("tab", { name: "Fabrico" }).click();
  await page.getByTestId("ficheiro-fabrico").setInputFiles("tests/fixtures/fabrico-mini.xlsx");
  await page.getByTestId("aplicar-importacao").click();
  await page.getByRole("tab", { name: "Cores" }).click();
  await page.getByTestId("propriedade-cor").selectOption({ label: "Fabrico / Corte · %" });
  await page.getByTestId("aplicar-cores").click();
  await expect(page.getByTestId("legenda")).toContainText("100%");
  await expect(page.locator(".piece.is-colored")).toHaveCount(8);
  await shot(page, "10-cores-legenda.png");
});

test("07 conjuntos de propriedades", async ({ page }) => {
  await page.getByRole("tab", { name: "Definições" }).click();
  await page.getByTestId("conjunto-colunas").selectOption("");
  await page.getByRole("tab", { name: "Consultar" }).click();
  await page.getByRole("button", { name: "Laje L1" }).click();
  await page.getByRole("checkbox", { name: "Material / Grau" }).check();
  await page.getByRole("checkbox", { name: "Quantidades / Volume" }).check();
  await page.getByRole("tab", { name: "Conjuntos" }).click();
  await page.getByTestId("nome-conjunto").fill("Betão: classe, volume");
  await page.getByTestId("guardar-conjunto").click();
  await page.getByRole("button", { name: "Aplicar" }).first().click();
  await expect(page.getByText("Em uso")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Betão: classe, volume" })).toBeVisible();
  await shot(page, "07-conjuntos-de-propriedades.png");
});
