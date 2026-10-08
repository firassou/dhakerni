import { expect, test } from "@playwright/test";

test("follows system language, then manual override flips to RTL", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { name: "Nothing for today" })).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "العربية" }).click();

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar-TN");
  await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("French is chosen automatically from navigator.languages", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "fr-FR" });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Rien pour aujourd'hui" })).toBeVisible();
  await ctx.close();
});
