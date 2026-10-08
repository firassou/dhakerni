import { expect, test, type Page } from "@playwright/test";

const parse = {
  tasks: [
    {
      title: "نشري الخبز",
      notes: null,
      priority: null,
      list: null,
      reminderId: "r",
      recurrence: null,
      subtasks: [],
      uncertain: [],
    },
  ],
  reminders: [
    {
      id: "r",
      when: {
        kind: "anchor",
        day: null,
        weekday: null,
        date: null,
        time: null,
        dayPart: null,
        offsetMinutes: null,
        vagueWord: null,
        anchor: "after_prayer_asr",
        confidence: 1,
      },
    },
  ],
};

async function setup(page: Page) {
  await page.route("**/api/parse", (r) => r.fulfill({ json: parse }));
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

test("choosing a city shows today's five prayer times", async ({ page }) => {
  await setup(page);
  await page.goto("/settings");
  await page.getByLabel("City").selectOption("tunis");
  const times = page.getByLabel("Today").locator("dd");
  await expect(times).toHaveCount(5);
  const texts = await times.allTextContents();
  expect(texts.every((x) => /^\d{2}:\d{2}$/.test(x))).toBe(true);
  expect([...texts].sort()).toEqual(texts); // fajr < dhuhr < asr < maghrib < isha
  await page.reload();
  await expect(page.getByLabel("City")).toHaveValue("tunis"); // remembered
});

test("without a city, 'after Asr' asks and offers to set the city", async ({ page }) => {
  await setup(page);
  await page.getByLabel("Add a task").fill("بعد العصر نشري الخبز");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("group", { name: /[?؟]$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Use prayer times for my city" })).toHaveAttribute(
    "href",
    "/settings#prayer",
  );
});

test("with a city, 'after Asr' becomes a real time shown as an editable chip", async ({ page }) => {
  await setup(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open("dhakerni");
        open.onsuccess = () => {
          const tx = open.result.transaction("meta", "readwrite");
          tx.objectStore("meta").put("tunis", "city");
          tx.oncomplete = () => resolve();
        };
      }),
  );
  await page.reload();
  await page.waitForTimeout(400);
  await page.getByLabel("Add a task").fill("بعد العصر نشري الخبز");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("group", { name: /[?؟]$/ })).toHaveCount(0); // no question: we know when
  await expect(page.getByRole("button", { name: /After Asr ≈ \d{2}:\d{2}/ })).toBeVisible();
  // and no "I'm leaving" style trigger for a prayer
  await expect(page.getByRole("group", { name: "Triggers" })).toHaveCount(0);
});
