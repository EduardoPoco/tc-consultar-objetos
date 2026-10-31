import { expect, test } from "@playwright/test";

test("anfitrião 3dviewer: a seleção mostra as propriedades", async ({ page }) => {
  await page.goto("/?contexto=3dviewer");
  await page.getByRole("button", { name: "Viga V1" }).click();
  await expect(page.getByTestId("contagem")).toContainText("1 objeto na consulta");
  await expect(page.locator(".check", { has: page.getByRole("checkbox", { name: "Perfil / Nome" }) })).toContainText("HEA200");
  await expect(page.getByTestId("nome-projeto")).toHaveCount(0);
});

test("anfitrião projeto: mostra a página do projeto e não o painel 3D", async ({ page }) => {
  await page.goto("/?contexto=projeto");
  await expect(page.getByTestId("nome-projeto")).toHaveText("OB3270-SNF-BC Metalnord");
  await expect(page.getByRole("heading", { name: "Informação do projeto" })).toBeVisible();
  await expect(page.getByTestId("contagem")).toHaveCount(0);
  await expect(page.getByTestId("modelo")).toHaveCount(0);
});
