import { expect, test } from "@playwright/test";

test("mostra a informação do projeto de demonstração", async ({ page }) => {
  await page.goto("/?projeto=1");
  await expect(page.getByRole("heading", { name: "Consultar Objetos" })).toBeVisible();
  await expect(page.getByTestId("nome-projeto")).toHaveText("OB3270-SNF-BC Metalnord");
  await expect(page.getByTestId("id-projeto")).toHaveText("projeto-demonstracao");
  await expect(page.getByTestId("regiao-projeto")).toContainText("Europa");
  await expect(page.getByTestId("utilizador-projeto")).toContainText("Ana Martins");
  await expect(page.getByTestId("menu-projeto")).toContainText("Projeto");
  await expect(page.getByRole("button", { name: "Modelos" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ligações" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Consultar" })).toHaveCount(0);
});

test("abre o relatório filtrado pela obra do nome do projeto", async ({ page }) => {
  await page.goto("/?projeto=1");
  await page.getByRole("button", { name: "Relatório" }).click();
  await expect(page.getByTestId("obra-detectada")).toContainText("3270");
  await expect(page.getByTestId("atalho-relatorio")).toHaveText("Relatório de produção — Obra 3270");
  await expect(page.getByTestId("atalho-relatorio")).toHaveAttribute("target", "_blank");
  await expect(page.getByTestId("atalho-relatorio")).toHaveAttribute("href", /NObra=3270/);
  await expect(page.getByTestId("relatorio-param")).toHaveValue("NObra");
  await page.getByTestId("testar-relatorio").click();
  await expect(page.getByTestId("url-relatorio")).toContainText("NObra=3270");
  await expect(page.getByTestId("url-relatorio")).toContainText("192.168.1.9");
});

test("pede o número da obra quando o projeto não começa por OB", async ({ page }) => {
  await page.goto("/?projeto=1&nome=Armaz%C3%A9m%20norte");
  await page.getByRole("button", { name: "Relatório" }).click();
  await expect(page.getByTestId("obra-manual")).toBeVisible();
  await page.getByTestId("obra-manual").fill("3228");
  await page.getByTestId("guardar-obra").click();
  await expect(page.getByTestId("atalho-relatorio")).toHaveText("Relatório de produção — Obra 3228");
  await page.goto("/?projeto=1&nome=ob3228%20estrutura");
  await page.getByRole("button", { name: "Relatório" }).click();
  await expect(page.getByTestId("obra-detectada")).toContainText("3228");
});

