import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const when = (p: object) => ({
  kind: "relative",
  day: null,
  weekday: null,
  date: null,
  time: null,
  dayPart: null,
  offsetMinutes: 10,
  vagueWord: null,
  anchor: null,
  confidence: 0.9,
  ...p,
});

async function reset(page: Page) {
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
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/parse", (route) =>
    route.fulfill({
      json: {
        tasks: [
          {
            title: "نطفي الفرن",
            notes: null,
            priority: null,
            list: null,
            reminderId: "r1",
            recurrence: null,
            subtasks: [],
            uncertain: [],
          },
        ],
        reminders: [{ id: "r1", when: when({}) }],
      },
    }),
  );
  await reset(page);
});

test("offline: pill shows, mic is off, typing still saves, and the AI fills it in when back online", async ({
  page,
  context,
}) => {
  await expect(page.getByTestId("offline-pill")).toHaveCount(0);

  await context.setOffline(true);
  await expect(page.getByTestId("offline-pill")).toBeVisible();
  await expect(page.getByRole("button", { name: "Voice needs internet" })).toBeDisabled();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);

  // Typed while offline: kept as written, no time yet.
  await page.getByLabel("Add a task").fill("نطفي الفرن");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(/when you're back online/)).toBeVisible();
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "نطفي الفرن" })).toBeVisible();

  // The rest of the app keeps working offline.
  await page.getByRole("button", { name: "Mark as done" }).click();

  // Back online: the AI pass runs on its own and the pill goes away.
  await context.setOffline(false);
  await expect(page.getByTestId("offline-pill")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hold to talk" })).toBeEnabled();
});

test("offline task that is still open gets its time once online", async ({ page, context }) => {
  await context.setOffline(true);
  await page.getByLabel("Add a task").fill("نطفي الفرن");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("tab", { name: "Needs time" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "نطفي الفرن" })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(/Online again: filled in/)).toBeVisible();
  await page.getByRole("tab", { name: "Today" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "نطفي الفرن" })).toBeVisible();
});
