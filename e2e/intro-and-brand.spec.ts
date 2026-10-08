import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const force = (page: Page) =>
  page.addInitScript(() => localStorage.setItem("dhakerni.forceIntro", "1"));
const intro = (page: Page) => page.locator(".intro");
const attr = (page: Page, name: "intro" | "introDone") =>
  page.evaluate((n) => document.documentElement.dataset[n] ?? null, name);

test.describe("intro animation", () => {
  test("does not run under automation, so other tests are never blocked", async ({ page }) => {
    await page.goto("/");
    await expect(intro(page)).toBeHidden();
    expect(await attr(page, "intro")).toBe("off");
  });

  test("plays on first open, covers the app, then lifts by itself and wakes the mic", async ({
    page,
  }) => {
    await force(page);
    await page.goto("/");
    await expect(intro(page)).toBeVisible();
    await expect(intro(page).locator(".intro-word")).toHaveText("Dhakerni");
    expect(await intro(page).getAttribute("aria-hidden")).toBe("true"); // decorative for screen readers

    await expect(intro(page)).toBeHidden({ timeout: 4500 });
    expect(await attr(page, "introDone")).toBe("1");
    await expect(page.getByRole("button", { name: "Hold to talk" })).toBeVisible();
  });

  test("a tap skips it right away", async ({ page }) => {
    await force(page);
    await page.goto("/");
    await expect(intro(page)).toBeVisible();
    await page.mouse.click(100, 100);
    await expect(intro(page)).toBeHidden({ timeout: 900 });
  });

  test("any key skips it too", async ({ page }) => {
    await force(page);
    await page.goto("/");
    await expect(intro(page)).toBeVisible();
    await page.keyboard.press("Space");
    await expect(intro(page)).toBeHidden({ timeout: 900 });
  });

  test("plays once per session: a reload goes straight to the app", async ({ page }) => {
    await force(page);
    await page.goto("/");
    await page.mouse.click(100, 100);
    await expect(intro(page)).toBeHidden();
    await page.reload();
    await expect(intro(page)).toBeHidden();
    expect(await attr(page, "intro")).toBe("off");
  });

  test("never plays for people who asked for less motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await force(page);
    await page.goto("/");
    expect(await attr(page, "intro")).toBe("off");
    await expect(intro(page)).toBeHidden();
  });

  test("only on the home screen, and not when opened from a notification", async ({ page }) => {
    await force(page);
    await page.goto("/settings");
    expect(await attr(page, "intro")).toBe("off");
    await page.goto("/?task=abc");
    expect(await attr(page, "intro")).toBe("off");
  });

  test("the launch colour of the installed app is the intro's blue, so they flow together", async ({
    request,
  }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.background_color).toBe("#2152d1");
  });
});

test.describe("favicon", () => {
  test("/favicon.ico is the Dhakerni icon, not the framework default", async ({ request }) => {
    const res = await request.get("/favicon.ico");
    expect(res.status()).toBe(200);
    const served = await res.body();
    const ours = readFileSync("src/app/favicon.ico");
    expect(served.equals(ours)).toBe(true);
    expect(served.readUInt16LE(2)).toBe(1); // an icon file
    expect(served.readUInt16LE(4)).toBe(3); // 16, 32 and 48 px
  });

  test("every icon link on the page points at one of our icons", async ({ page }) => {
    await page.goto("/");
    const links = await page
      .locator('link[rel~="icon"], link[rel="apple-touch-icon"]')
      .evaluateAll((els) => els.map((e) => (e as HTMLLinkElement).getAttribute("href")));
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const href of links) {
      expect(href).toMatch(/^\/(favicon\.ico|icon\.png|apple-icon\.png)/);
      const res = await page.request.get(href!);
      expect(res.status(), href!).toBe(200);
      expect((await res.body()).length).toBeLessThan(20_000);
    }
    // the framework's default black icon was ~15 KB at /favicon.ico; ours is the small 3-size file
    const ico = await page.request.get("/favicon.ico");
    expect((await ico.body()).length).toBeLessThan(5000);
  });
});

test.describe("brand link", () => {
  test("Settings and Memory both have a way home", async ({ page }) => {
    for (const route of ["/settings", "/memory"]) {
      await page.goto(route);
      await page.getByRole("link", { name: "Dhakerni: Home" }).click();
      await expect(page).toHaveURL(/\/$/);
    }
  });

  test("on the home screen it returns to Today", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Done" }).click();
    await expect(page.getByRole("tab", { name: "Done" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("link", { name: "Dhakerni: Home" }).click();
    await expect(page.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true");
  });

  test("it works with the keyboard", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("link", { name: "Dhakerni: Home" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/$/);
  });
});
