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

test("12 modelos", async ({ page }) => {
  await page.goto("/?projeto=1");
  await page.getByRole("button", { name: "Modelos" }).click();
  await expect(page.getByTestId("tabela-ficheiros")).toContainText("Arquitetura.ifc");
  await shot(page, "12-modelos.png");
});

test("13 ligações", async ({ page }) => {
  await page.goto("/?projeto=1");
  await page.getByRole("button", { name: "Ligações" }).click();
  await page.getByTestId("ligacao-nome").fill("Portal da obra");
  await page.getByTestId("ligacao-url").fill("https://exemplo.pt/obra");
  await page.getByTestId("guardar-ligacao").click();
  await expect(page.getByRole("link", { name: "Portal da obra" })).toBeVisible();
  await shot(page, "13-ligacoes.png");
});

test("14 relatório de produção", async ({ page }) => {
  await page.goto("/?projeto=1");
  await page.getByRole("button", { name: "Relatório" }).click();
  await page.getByTestId("testar-relatorio").click();
  await expect(page.getByTestId("url-relatorio")).toContainText("NObra=3270");
  await shot(page, "14-relatorio-producao.png");
});

test("15 como usar", async ({ page }) => {
  await page.goto("/?projeto=1");
  await page.getByRole("button", { name: "Como usar" }).click();
  await expect(page.getByTestId("seccao-ajuda")).toContainText("Mostrar etiquetas");
  await shot(page, "15-como-usar.png");
});
