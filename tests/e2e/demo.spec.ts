import { expect, test } from "@playwright/test";
import fs from "node:fs";

test.beforeEach(async ({ page }) => {
  await page.goto("/?demo=1");
});

test("mostra o painel vazio e pede para selecionar objetos", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Consultar Objetos" })).toBeVisible();
  await expect(page.getByTestId("contagem")).toHaveText("Nenhum objeto na consulta");
  await expect(page.getByTestId("origem")).toContainText("Aprovisionamento");
  await expect(page.getByText("Guarde uma Vista para as conservar.")).toBeVisible();
  await expect(page.getByTestId("mostrar-etiquetas")).toBeDisabled();
  await page.getByRole("tab", { name: "Definições" }).click();
  await expect(page.getByTestId("max-etiquetas")).toHaveValue("20");
  await page.getByRole("tab", { name: "Consultar" }).click();
  await expect(page.getByTestId("modelo")).toBeVisible();
});

test("lê as propriedades do objeto selecionado", async ({ page }) => {
  await page.getByRole("button", { name: "Viga V1" }).click();
  await expect(page.getByTestId("contagem")).toContainText("1 objeto na consulta");
  await expect(page.getByRole("checkbox", { name: "Perfil / Nome" })).toBeVisible();
  await expect(page.locator(".check-value", { hasText: "HEA200" })).toBeVisible();
  await expect(page.locator(".check-value", { hasText: "253,8 kg" })).toBeVisible();
  await expect(page.locator(".check", { hasText: "Comprimento" })).toContainText("mm");
});

test("Ctrl+clique acumula a seleção", async ({ page }) => {
  await page.getByRole("button", { name: "Viga V1" }).click();
  await page.getByRole("button", { name: "Pilar P1" }).click({ modifiers: ["Control"] });
  await expect(page.getByTestId("contagem")).toContainText("2 objetos na consulta");
  await page.getByRole("tab", { name: "Tabela" }).click();
  await expect(page.getByTestId("linha-objeto")).toHaveCount(2);
  await expect(page.getByTestId("linha-total")).toContainText("2 peças");
});

test("coloca etiquetas na vertical e na horizontal, com ou sem unidades", async ({ page }) => {
  await page.getByRole("button", { name: "Viga V1" }).click();
  await page.getByRole("checkbox", { name: "Perfil / Nome" }).check();
  await page.getByRole("checkbox", { name: "Quantidades / Peso" }).check();
  await page.getByTestId("mostrar-etiquetas").click();
  const label = page.getByTestId("etiqueta");
  await expect(label).toHaveCount(1);
  expect(await label.textContent()).toBe("HEA200\n253,8 kg");

  await page.getByRole("tab", { name: "Definições" }).click();
  await expect(page.getByTestId("mostrar-propriedade")).not.toBeChecked();
  await expect(page.getByTestId("mostrar-nome")).not.toBeChecked();
  await page.getByTestId("disposicao-horizontal").check();
  await expect.poll(async () => label.textContent()).toBe("HEA200 | 253,8 kg");

  await page.getByTestId("mostrar-propriedade").check();
  await expect.poll(async () => label.textContent()).toBe("Perfil: HEA200 | Peso: 253,8 kg");
  await page.getByTestId("mostrar-propriedade").uncheck();

  await page.getByTestId("mostrar-unidades").uncheck();
  await expect.poll(async () => label.textContent()).toBe("HEA200 | 253,8");

  await page.getByRole("tab", { name: "Consultar" }).click();
  await page.getByTestId("limpar-etiquetas").click();
  await expect(label).toHaveCount(0);
});

test("filtra a tabela e exporta CSV compatível com o Excel", async ({ page }) => {
  await page.getByRole("button", { name: "Viga V1" }).click();
  await page.getByRole("button", { name: "Pilar P1" }).click({ modifiers: ["Control"] });
  await page.getByRole("tab", { name: "Tabela" }).click();
  await page.getByTestId("pesquisa").fill("s275");
  await expect(page.getByRole("columnheader", { name: /Grau do material/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Perfil" })).toHaveCount(0);
  await expect(page.getByTestId("linha-total")).toContainText("2 peças");

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("exportar").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("consulta-objetos.csv");
  const path = await download.path();
  const csv = fs.readFileSync(path!, "utf8");
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain("Peça;Grau do material\r\n");
  expect(csv).toContain("S275JR");
  expect(csv).toContain("Total · 2 peças");
  expect(csv).not.toContain("HEA200");
});

test("isola, pinta e repõe os objetos consultados", async ({ page }) => {
  await page.getByTestId("selecionar-amostra").click();
  await page.getByTestId("isolar").click();
  await expect(page.getByTestId("feedback")).toContainText("isolados e coloridos");
  await expect(page.locator(".piece.is-colored")).toHaveCount(3);
  await expect(page.locator(".piece.is-hidden")).toHaveCount(5);
  await page.getByTestId("repor").click();
  await expect(page.locator(".piece.is-hidden")).toHaveCount(0);
  await expect(page.locator(".piece.is-colored")).toHaveCount(0);
  await expect(page.getByTestId("feedback")).toContainText("repostas");
});

test("avisa quando a seleção passa de 20 objetos", async ({ page }) => {
  await page.getByTestId("selecionar-muitos").click();
  await expect(page.getByTestId("aviso")).toContainText("25 objetos");
  await expect(page.getByTestId("aviso")).toContainText("etiquetas");
  await expect(page.getByTestId("aviso")).toContainText("tabela inclui todos");
  await expect(page.getByTestId("aviso")).not.toContainText("consulta está limitada");
  await page.getByRole("tab", { name: "Tabela" }).click();
  await expect(page.getByTestId("linha-objeto")).toHaveCount(25);
  await expect(page.getByTestId("linha-total")).toBeVisible();
});

test("guarda e aplica conjuntos de propriedades neste navegador", async ({ page }) => {
  await page.getByRole("tab", { name: "Conjuntos" }).click();
  await expect(page.getByRole("heading", { name: "Aço: perfil, material, peso" })).toBeVisible();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await page.getByRole("tab", { name: "Consultar" }).click();
  await expect(page.getByRole("checkbox", { name: "Perfil / Nome" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Material / Grau" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Quantidades / Peso" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Identificação / Nome" })).not.toBeChecked();

  await page.getByRole("tab", { name: "Conjuntos" }).click();
  await page.getByTestId("nome-conjunto").fill("Betão: classe, volume");
  await page.getByTestId("guardar-conjunto").click();
  await expect(page.getByRole("heading", { name: "Betão: classe, volume" })).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Conjuntos" }).click();
  await expect(page.getByRole("heading", { name: "Aço: perfil, material, peso" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Betão: classe, volume" })).toBeVisible();
});

test("usa as propriedades do modelo quando a tabela de dados não existe", async ({ page }) => {
  await page.goto("/?demo=1&semTabela=1");
  await page.getByRole("button", { name: "Viga V1" }).click();
  await expect(page.getByTestId("origem")).toContainText("não está disponível");
  await expect(page.getByRole("checkbox", { name: "Perfil / Nome" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Perfil / Altura" })).toBeVisible();
});

test("troca o conjunto de colunas", async ({ page }) => {
  await page.getByRole("tab", { name: "Definições" }).click();
  await page.getByTestId("conjunto-colunas").selectOption("Geometria");
  await page.getByRole("tab", { name: "Consultar" }).click();
  await expect(page.getByTestId("origem")).toContainText("Geometria");
  await expect(page.getByRole("checkbox", { name: "Perfil / Altura" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Material / Grau" })).toHaveCount(0);
});
