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
const task = (title: string, reminderId: string | null) => ({
  title,
  notes: null,
  priority: null,
  list: null,
  reminderId,
  recurrence: null,
  subtasks: [],
  uncertain: [],
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
  await page.route("**/api/parse", (route) => {
    const body = route.request().postDataJSON() as { text: string };
    const text = body.text;
    if (text.includes("fail"))
      return route.fulfill({ status: 502, json: { error: "parse_failed" } });
    if (text.includes("10")) {
      return route.fulfill({
        json: {
          tasks: [task("نطفي الفرن", "r1")],
          reminders: [{ id: "r1", when: when({ kind: "relative", offsetMinutes: 10 }) }],
        },
      });
    }
    return route.fulfill({
      json: {
        tasks: [task("نعمل réunion", "r1"), task("نبعث الميل", "r1")],
        reminders: [{ id: "r1", when: when({ kind: "vague", vagueWord: "بعد شوية" }) }],
      },
    });
  });
  await page.route("**/api/transcribe", (route) =>
    route.fulfill({ json: { text: "بعد 10 دقايق نطفي الفرن" } }),
  );
  await reset(page);
});

test("typed multi-task utterance shares one vague reminder and lands in Needs time", async ({
  page,
}) => {
  await page.getByLabel("Add a task").fill("بعد شوية باش نعمل réunion و نبعث الميل");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Needs time" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("نعمل réunion")).toBeVisible();
  await expect(page.getByText("نبعث الميل")).toBeVisible();
  await expect(page.getByText("2 tasks added")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("نعمل réunion")).toHaveCount(0);
});

test("holding the mic records, shows the waveform, and creates a timed task", async ({ page }) => {
  const mic = page.getByRole("button", { name: "Hold to talk" });
  const box = (await mic.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByRole("button", { name: "Stop and send" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /0:0\d/ })).toBeVisible();
  await page.waitForTimeout(900);
  await page.mouse.up();

  // 10 minutes from now is due today
  await expect(page.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("نطفي الفرن")).toBeVisible();
});

test("tap to talk keeps recording until Stop", async ({ page }) => {
  await page.getByRole("button", { name: "Hold to talk" }).click({ delay: 40 });
  const stop = page.getByRole("button", { name: "Stop and send" });
  await expect(stop).toBeVisible();
  await page.waitForTimeout(700);
  await stop.click();
  await expect(page.getByText("نطفي الفرن")).toBeVisible();
});

test("parser failure still saves what was typed", async ({ page }) => {
  await page.getByLabel("Add a task").fill("fail please");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("fail please")).toBeVisible();
  await expect(page.getByText(/saved as written/)).toBeVisible();
});
