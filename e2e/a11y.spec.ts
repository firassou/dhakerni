import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const when = (p: object) => ({
  kind: "vague",
  day: null,
  weekday: null,
  date: null,
  time: null,
  dayPart: null,
  offsetMinutes: null,
  vagueWord: null,
  anchor: null,
  confidence: 0.9,
  ...p,
});

async function seed(page: Page) {
  await page.route("**/api/parse", (route) =>
    route.fulfill({
      json: {
        tasks: [
          {
            title: "نعمل réunion",
            notes: null,
            priority: "high",
            list: "work",
            reminderId: "r",
            recurrence: null,
            subtasks: [],
            uncertain: [],
          },
          {
            title: "Appeler maman",
            notes: null,
            priority: null,
            list: null,
            reminderId: null,
            recurrence: null,
            subtasks: [],
            uncertain: [],
          },
        ],
        reminders: [{ id: "r", when: when({ vagueWord: "بعد شوية" }) }],
      },
    }),
  );
  await page.route("**/api/push/key", (r) =>
    r.fulfill({
      json: {
        enabled: true,
        key: "BDDqiyBc4hDdrW8WxAkbi390P7mKyTCV_h9cSDJWW8SELADQ0bRjeuk2ZAY02QrhldlnK42UMsSw37ZL1XRIazs",
      },
    }),
  );
  await page.addInitScript(() =>
    Object.defineProperty(Notification, "permission", { get: () => "default" }),
  );
}

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
  );
  expect(summary, `${label}\n${summary.join("\n")}`).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  for (const lang of ["en", "ar"] as const) {
    test(`no WCAG AA violations: ${scheme}, ${lang}`, async ({ page }) => {
      await seed(page);
      await page.emulateMedia({ colorScheme: scheme });
      await page.addInitScript((l) => localStorage.setItem("dhakerni.locale", l), lang);
      await page.goto("/");
      await page.waitForTimeout(400);
      await scan(page, `home empty (${scheme}, ${lang})`);

      // tasks, an open question, and a push banner
      const add = page.locator("#quick-add");
      await add.fill("بعد شوية باش نعمل réunion و Appeler maman");
      await page.locator('button[type="submit"]').click(); // its label follows the language
      await page.getByRole("group", { name: /[?؟]$/ }).waitFor();
      await page.waitForTimeout(500);
      await scan(page, `home with question (${scheme}, ${lang})`);

      for (const route of ["/settings", "/memory"]) {
        await page.goto(route);
        await page.waitForTimeout(500);
        await scan(page, `${route} (${scheme}, ${lang})`);
      }
    });
  }
}

test("the task editor sheet has no violations", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await page.locator("#quick-add").fill("x y z");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page
    .getByRole("button", { name: /^Edit task/ })
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
  await scan(page, "editor");
});

test("the scanner really catches problems (guards against a false pass)", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const p = document.createElement("p");
    p.textContent = "faint text";
    p.style.cssText = "color:#cccccc;background:#ffffff;position:fixed;top:0;left:0";
    document.body.append(p);
  });
  const results = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toContain("color-contrast");
});
