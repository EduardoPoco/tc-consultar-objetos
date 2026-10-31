import { expect, test } from "@playwright/test";

test("pinta o modelo pelo grau do material e repõe as cores", async ({ page }) => {
  await page.goto("/?demo=1");
  await page.getByRole("tab", { name: "Cores" }).click();
  await expect(page.getByTestId("propriedade-cor").locator("option", { hasText: "Material / Grau" })).toBeAttached();
  await page.getByTestId("propriedade-cor").selectOption({ label: "Material / Grau" });
  await page.getByTestId("aplicar-cores").click();
  await expect(page.getByTestId("legenda")).toContainText("S275JR");
  await expect(page.getByTestId("legenda")).toContainText("S355");
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
