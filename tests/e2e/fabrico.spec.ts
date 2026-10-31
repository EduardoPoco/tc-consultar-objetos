import { expect, test } from "@playwright/test";

test("o separador Fabrico fica fora do painel", async ({ page }) => {
  await page.goto("/?demo=1");
  await expect(page.getByRole("tab", { name: "Fabrico" })).toHaveCount(0);
  await expect(page.getByTestId("ficheiro-fabrico")).toHaveCount(0);
});
