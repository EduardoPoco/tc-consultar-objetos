import { expect, test } from "@playwright/test";

test("pinta o modelo pelo progresso de corte e repõe as cores", async ({ page }) => {
  await page.goto("/?demo=1");
  await page.getByRole("tab", { name: "Fabrico" }).click();
  await page.getByTestId("ficheiro-fabrico").setInputFiles("tests/fixtures/fabrico-mini.xlsx");
  await page.getByTestId("aplicar-importacao").click();
  await page.getByRole("tab", { name: "Cores" }).click();
  await page.getByTestId("propriedade-cor").selectOption({ label: "Fabrico / Corte · %" });
  await page.getByTestId("aplicar-cores").click();
  await expect(page.getByTestId("legenda")).toContainText("0%");
  await expect(page.getByTestId("legenda")).toContainText("100%");
  const colorOf = (name: string) => page.getByRole("button", { name }).evaluate((element) => getComputedStyle(element).backgroundColor);
  const beam = await colorOf("Viga V1");
  const column = await colorOf("Pilar P1");
  const slab = await colorOf("Laje L1");
  expect(beam).not.toBe(column);
  expect(slab).not.toBe(beam);
  await page.getByTestId("repor-cores").click();
  await expect(page.getByTestId("legenda")).toBeEmpty();
  expect(await colorOf("Viga V1")).not.toBe(beam);
});
