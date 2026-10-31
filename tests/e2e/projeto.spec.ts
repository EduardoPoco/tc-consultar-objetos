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
