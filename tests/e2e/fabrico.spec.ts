import { expect, test } from "@playwright/test";

const workbook = "tests/fixtures/fabrico-mini.xlsx";

test.beforeEach(async ({ page }) => {
  await page.goto("/?demo=1");
  await page.getByRole("tab", { name: "Fabrico" }).click();
});

test("importa o Excel, liga os conjuntos e mostra o relatório", async ({ page }) => {
  await page.getByTestId("ficheiro-fabrico").setInputFiles(workbook);
  await expect(page.getByTestId("linha-cabecalho")).toHaveValue("8");
  await expect(page.getByTestId("tabela-mapeamento").getByText("Corte · Data", { exact: true })).toBeVisible();
  await expect(page.getByTestId("coluna-chave")).toHaveValue("1");
  await expect(page.getByTestId("propriedade-chave")).toHaveValue("Identificação||Conjunto");

  await page.getByTestId("linha-cabecalho").fill("7");
  await page.getByTestId("linha-cabecalho").press("Enter");
  await expect(page.getByTestId("tabela-mapeamento").getByText("Corte · Data", { exact: true })).toHaveCount(0);

  await page.getByTestId("linha-cabecalho").fill("8");
  await page.getByTestId("linha-cabecalho").press("Enter");
  await expect(page.getByTestId("tabela-mapeamento").getByText("Corte · Data", { exact: true })).toBeVisible();

  await page.getByTestId("aplicar-importacao").click();
  await expect(page.getByTestId("objetos-ligados")).toHaveText("7 objetos com linha");
  await expect(page.getByTestId("linhas-sem-objeto")).toContainText("ZSCA99-0");
  await expect(page.getByTestId("linhas-sem-objeto")).toContainText("ZSCA15-0");
  await expect(page.getByTestId("objetos-sem-linha")).toContainText("Laje L1");

  await page.getByRole("tab", { name: "Consultar" }).click();
  await page.getByRole("button", { name: "Viga V1" }).click();
  await expect(page.getByRole("checkbox", { name: "Fabrico / Corte · %" })).toBeVisible();
  await expect(page.locator(".check", { hasText: "Corte · %" })).toContainText("60%");

  await page.reload();
  await page.getByRole("tab", { name: "Fabrico" }).click();
  await expect(page.getByTestId("objetos-ligados")).toHaveText("7 objetos com linha");
});

test("guarda o mapeamento e volta a aplicá-lo", async ({ page }) => {
  await page.getByTestId("ficheiro-fabrico").setInputFiles(workbook);
  await page.getByTestId("nome-mapeamento").fill("Obra demo");
  await page.getByTestId("guardar-mapeamento").click();
  await page.reload();
  await page.getByRole("tab", { name: "Fabrico" }).click();
  await page.getByTestId("ficheiro-fabrico").setInputFiles(workbook);
  await expect(page.getByTestId("nome-mapeamento")).toHaveValue("Obra demo");
  await expect(page.getByRole("checkbox", { name: "Importar Corte · Data" })).toBeChecked();
});
