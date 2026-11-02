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

test("11 informação do projeto", async ({ page }) => {
  await page.goto("/?projeto=1");
  await expect(page.getByTestId("nome-projeto")).toHaveText("OB3270-SNF-BC Metalnord");
  await shot(page, "11-pagina-projeto.png");
});

test("14 relatório de produção", async ({ page }) => {
  await page.goto("/?projeto=1");
  await page.getByRole("button", { name: "Relatório Produção" }).click();
  await expect(page.getByTestId("atalho-relatorio")).toContainText("Obra 3270");
  await expect(page.getByText("Endereço base")).toHaveCount(0);
  await shot(page, "14-relatorio-producao.png");
});

test("15 como usar", async ({ page }) => {
  await page.goto("/?projeto=1");
  await page.getByRole("button", { name: "Como usar" }).click();
  await expect(page.getByTestId("seccao-ajuda")).toContainText("Mostrar etiquetas");
  await shot(page, "15-como-usar.png");
});
