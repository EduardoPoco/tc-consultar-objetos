import { expect, test } from "@playwright/test";

test("mostra a informação do projeto de demonstração", async ({ page }) => {
  await page.goto("/?projeto=1");
  await expect(page.getByRole("heading", { name: "Consultar Objetos" })).toBeVisible();
  await expect(page.getByTestId("nome-projeto")).toHaveText("OB3270-SNF-BC Metalnord");
  await expect(page.getByTestId("id-projeto")).toHaveText("projeto-demonstracao");
  await expect(page.getByTestId("regiao-projeto")).toContainText("Europa");
  await expect(page.getByTestId("utilizador-projeto")).toContainText("Ana Martins");
  await expect(page.getByTestId("menu-projeto")).toContainText("Projeto");
  await expect(page.getByRole("tab", { name: "Consultar" })).toHaveCount(0);
});

test("lista pastas e abre um modelo de demonstração", async ({ page }) => {
  await page.goto("/?projeto=1");
  await page.getByRole("button", { name: "Modelos" }).click();
  await expect(page.getByTestId("tabela-ficheiros")).toContainText("Arquitetura.ifc");
  await expect(page.getByTestId("aviso-ficheiros")).toContainText("demonstração");
  await page.getByRole("button", { name: "Abrir pasta" }).click();
  await expect(page.getByTestId("caminho")).toContainText("Estrutura");
  await expect(page.getByTestId("tabela-ficheiros")).toContainText("Estrutura.ifc");
  await page.getByRole("button", { name: "Abrir no visualizador 3D" }).click();
  await expect(page.getByTestId("aviso-modelo")).toContainText("visualizador 3D");
  await page.getByTestId("subir-pasta").click();
  await expect(page.getByTestId("tabela-ficheiros")).toContainText("Notas.pdf");
});
