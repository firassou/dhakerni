import { expect, test, type Page } from "@playwright/test";

const when = (p: object) => ({
  kind: "relative",
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
const task = (title: string) => ({
  title,
  notes: null,
  priority: null,
  list: null,
  reminderId: "r1",
  recurrence: null,
  subtasks: [],
  uncertain: [],
});

async function mockParse(page: Page) {
  await page.route("**/api/parse", (route) => {
    const { text } = route.request().postDataJSON() as { text: string };
    const w = text.includes("work")
      ? when({ kind: "anchor", anchor: "leave_work" })
      : when({ offsetMinutes: 1 });
    return route.fulfill({ json: { tasks: [task(text)], reminders: [{ id: "r1", when: w }] } });
  });
}

async function clean(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    await Promise.all(
      dbs.map(
        (d) =>
          new Promise((r) => {
            const q = indexedDB.deleteDatabase(d.name!);
            q.onsuccess = q.onerror = q.onblocked = () => r(null);
          }),
      ),
    );
  });
}

async function add(page: Page, text: string) {
  await page.getByLabel("Add a task").fill(text);
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

test.describe("in-app reminders", () => {
  test.beforeEach(async ({ page }) => {
    await mockParse(page);
    await page.route("**/api/push/key", (r) => r.fulfill({ json: { enabled: false, key: null } }));
    await clean(page);
    await page.clock.install();
    await page.reload();
  });

  test("a due reminder alerts with Done, Snooze and Open", async ({ page }) => {
    await add(page, "call the plumber");
    await expect(page.getByRole("region", { name: "Reminders due" })).toHaveCount(0);

    await page.clock.fastForward(75_000);
    const alerts = page.getByRole("region", { name: "Reminders due" });
    await expect(alerts.getByText("call the plumber")).toBeVisible();
    for (const name of ["Done", "Snooze 10 min", "Open"])
      await expect(alerts.getByRole("button", { name })).toBeVisible();

    // it alerts once: no second alert after more time passes
    await alerts.getByRole("button", { name: "Snooze 10 min" }).click();
    await expect(alerts).toHaveCount(0);
    await page.clock.fastForward(5 * 60_000);
    await expect(alerts).toHaveCount(0);

    // ...and again once the snooze is over
    await page.clock.fastForward(6 * 60_000);
    await expect(alerts.getByText("call the plumber")).toBeVisible();
    await alerts.getByRole("button", { name: "Done" }).click();
    await expect(alerts).toHaveCount(0);
    await page.getByRole("tab", { name: "Done" }).click();
    await expect(page.getByText("call the plumber")).toBeVisible();
  });

  test("the leaving-work trigger fires the reminder now and teaches the time", async ({ page }) => {
    await add(page, "after work buy milk");
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByRole("region", { name: "Reminders due" })).toHaveCount(0);

    await page
      .getByRole("group", { name: "Triggers" })
      .getByRole("button", { name: "I'm leaving work" })
      .click();
    await expect(
      page.getByRole("region", { name: "Reminders due" }).getByText("after work buy milk"),
    ).toBeVisible();
    await expect(page.getByRole("group", { name: "Triggers" })).toHaveCount(0);

    const facts = await page.evaluate(
      () =>
        new Promise<{ key: string; source: string; confidence: number }[]>((resolve) => {
          const open = indexedDB.open("dhakerni");
          open.onsuccess = () => {
            const req = open.result.transaction("profile").objectStore("profile").getAll();
            req.onsuccess = () => resolve(req.result);
          };
        }),
    );
    // learned from behavior, but not trusted yet: one press is not a habit
    expect(facts).toMatchObject([{ key: "anchor.leave_work", source: "behavior" }]);
    expect(facts[0].confidence).toBeLessThan(0.6);
  });
});

test.describe("notification settings", () => {
  test("shows version and credit", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Made with love ❤️ by Firas")).toBeVisible();
    await expect(page.getByText(/Version\s*0\.\d+\.\d+/)).toBeVisible();
  });

  test("says plainly when the server cannot deliver background reminders", async ({ page }) => {
    await page.route("**/api/push/key", (r) => r.fulfill({ json: { enabled: false, key: null } }));
    await page.goto("/settings");
    await expect(page.getByText(/Background reminders aren't set up/)).toBeVisible();
  });

  test("offers to turn notifications on when available", async ({ page }) => {
    // Headless Chromium reports "denied" by default; a real first visit is "default".
    await page.addInitScript(() =>
      Object.defineProperty(Notification, "permission", { get: () => "default" }),
    );
    await page.route("**/api/push/key", (r) =>
      r.fulfill({
        json: {
          enabled: true,
          key: "BDDqiyBc4hDdrW8WxAkbi390P7mKyTCV_h9cSDJWW8SELADQ0bRjeuk2ZAY02QrhldlnK42UMsSw37ZL1XRIazs",
        },
      }),
    );
    await page.goto("/settings");
    await expect(page.getByText(/Off\. Reminders only show while the app is open/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn on" })).toBeVisible();
  });

  test("asks for notifications on the first visit, before any task exists", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Notification, "permission", { get: () => "default" });
      Notification.requestPermission = async () => {
        (window as unknown as { asked: number }).asked =
          ((window as unknown as { asked?: number }).asked ?? 0) + 1;
        return "default";
      };
    });
    await page.route("**/api/push/key", (r) => r.fulfill({ json: { enabled: true, key: "x" } }));
    await page.goto("/");
    // The browser's own prompt is opened once, with no tap and no task.
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { asked?: number }).asked))
      .toBe(1);
    // And the banner is there for browsers that only prompt after a tap.
    await expect(page.getByText("Get reminders even when the app is closed.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Get reminders even when the app is closed.")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { asked?: number }).asked ?? 0)).toBe(0);
  });

  test("blocked notifications explain how to fix it", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(() =>
      Object.defineProperty(Notification, "permission", { get: () => "denied" }),
    );
    await page.route("**/api/push/key", (r) => r.fulfill({ json: { enabled: true, key: "x" } }));
    await page.goto("/settings");
    await expect(page.getByText(/Blocked in your browser/)).toBeVisible();
    await ctx.close();
  });

  test("iPhone in Safari (not installed) gets install steps, not a dead button", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1",
    });
    const page = await ctx.newPage();
    await page.goto("/settings");
    await expect(page.getByText("Add Dhakerni to your Home Screen")).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn on" })).toHaveCount(0);
    await ctx.close();
  });

  test("the service worker registers", async ({ page }) => {
    await page.goto("/");
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toContain("localhost");
  });
});
