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
const parsed = (titles: string[], w: object) => ({
  tasks: titles.map((t) => task(t, "r1")),
  reminders: [{ id: "r1", when: when(w) }],
});

/** Text typed into the app decides which canned parse comes back. */
function mockParse(page: Page) {
  return page.route("**/api/parse", (route) => {
    const body = route.request().postDataJSON() as { text: string; followUp?: unknown };
    if (body.followUp)
      return route.fulfill({ json: parsed(["x"], { kind: "relative", offsetMinutes: 30 }) });
    if (body.text.includes("work"))
      return route.fulfill({
        json: parsed(["اشري الحليب"], { kind: "anchor", anchor: "leave_work" }),
      });
    if (body.text.includes("plain")) {
      return route.fulfill({ json: { tasks: [task("plain task", null)], reminders: [] } });
    }
    return route.fulfill({
      json: parsed(["نعمل réunion", "نبعث الميل"], { kind: "vague", vagueWord: "بعد شوية" }),
    });
  });
}

async function say(page: Page, text: string) {
  await page.getByLabel("Add a task").fill(text);
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

const facts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ key: string; value: string; source: string; confidence: number }[]>(
        (resolve) => {
          const open = indexedDB.open("dhakerni");
          open.onsuccess = () => {
            const req = open.result.transaction("profile").objectStore("profile").getAll();
            req.onsuccess = () => resolve(req.result);
          };
        },
      ),
  );

test.beforeEach(async ({ page }) => {
  await mockParse(page);
  await page.route("**/api/transcribe", (route) => route.fulfill({ json: { text: "نص ساعة" } }));
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
});

test("a vague time asks once for the whole group, saves the answer, and next time resolves silently", async ({
  page,
}) => {
  await say(page, "بعد شوية باش نعمل réunion و نبعث الميل");
  await expect(page.getByRole("tab", { name: "Needs time" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // one question for two tasks, one short line, 4 quick answers
  const q = page.getByRole("group", { name: "How long is “شوية” for you?" });
  await expect(q).toHaveCount(1);
  for (const label of ["15 min", "30 min", "1 h", "Tonight"])
    await expect(q.getByRole("button", { name: label })).toBeVisible();

  await q.getByRole("button", { name: "30 min" }).click();
  await expect(page.getByText("Saved: “شوية” = 30 min. Change anytime.")).toBeVisible();
  expect(await facts(page)).toMatchObject([{ key: "vague.شوية", value: "30", source: "answer" }]);

  await page.getByRole("tab", { name: "Today" }).click();
  await expect(page.getByText("نعمل réunion")).toBeVisible();
  await expect(page.getByText("نبعث الميل")).toBeVisible();

  // the same word again: no question, the learned meaning is used and shown as an editable chip
  await say(page, "بعد شوية again");
  await expect(page.getByRole("group")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /“شوية” = 30 min/ }).first()).toBeVisible();
});

test("an unknown anchor asks, remembers the answer, and uses it next time", async ({ page }) => {
  await say(page, "after work buy milk");
  const q = page.getByRole("group", { name: "What time do you usually leave work?" });
  await expect(q).toBeVisible();
  await q.getByRole("button", { name: "17:00" }).click();
  await expect(page.getByText(/Saved: After work ≈ 17:00/)).toBeVisible();
  expect(await facts(page)).toMatchObject([{ key: "anchor.leave_work", value: "17:00" }]);

  await say(page, "after work buy bread");
  await expect(page.getByRole("group")).toHaveCount(0);
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByRole("button", { name: /After work ≈ 17:00/ }).first()).toBeVisible();
});

test("a custom time can be typed", async ({ page }) => {
  await say(page, "after work buy milk");
  const q = page.getByRole("group");
  await q.getByRole("button", { name: "Other time" }).click();
  await q.getByLabel("Other time").fill("18:45");
  await q.getByRole("button", { name: "Set" }).click();
  await expect(page.getByText(/Saved: After work ≈ 18:45/)).toBeVisible();
  expect((await facts(page))[0]).toMatchObject({ key: "anchor.leave_work", value: "18:45" });
});

test("answering by voice works", async ({ page }) => {
  await say(page, "بعد شوية باش نعمل réunion و نبعث الميل");
  const q = page.getByRole("group");
  await q.getByRole("button", { name: "Answer by voice" }).click();
  await page.waitForTimeout(800);
  await q.getByRole("button", { name: "Stop and send answer" }).click();
  await expect(page.getByText("Saved: “شوية” = 30 min. Change anytime.")).toBeVisible();
});

test("ignoring the question keeps the task in Needs time; the chip asks again on demand", async ({
  page,
}) => {
  await say(page, "بعد شوية باش نعمل réunion و نبعث الميل");
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("group")).toHaveCount(0);
  await expect(page.getByText("نعمل réunion")).toBeVisible();
  await page.getByRole("button", { name: "Needs time" }).first().click();
  await expect(page.getByRole("group")).toHaveCount(1);
});

test("an ignored question comes back exactly once, hours later", async ({ page }) => {
  await say(page, "بعد شوية باش نعمل réunion و نبعث الميل");
  await page.getByRole("button", { name: "Not now" }).click();
  // pretend it was created four hours ago
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open("dhakerni");
        open.onsuccess = () => {
          const tx = open.result.transaction("tasks", "readwrite");
          const store = tx.objectStore("tasks");
          store.getAll().onsuccess = (e) => {
            for (const t of (e.target as IDBRequest).result) {
              t.createdAt = new Date(Date.now() - 4 * 3600_000).toISOString();
              store.put(t);
            }
          };
          tx.oncomplete = () => resolve();
        };
      }),
  );
  await page.reload();
  await expect(page.getByText(/Still need a time for/)).toBeVisible();
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByRole("group")).toHaveCount(1);

  // dismiss again, reload: it does not come back a second time
  await page.getByRole("button", { name: "Not now" }).click();
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("group")).toHaveCount(0);
  await expect(page.getByText(/Still need a time for/)).toHaveCount(0);
});

test("tasks with no time cue are not nagged", async ({ page }) => {
  await say(page, "plain");
  await expect(page.getByText("plain task")).toBeVisible();
  await expect(page.getByRole("group")).toHaveCount(0);
});

test("with learning off, the answer sets the time but nothing is saved", async ({ page }) => {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open("dhakerni");
        open.onsuccess = () => {
          const tx = open.result.transaction("meta", "readwrite");
          tx.objectStore("meta").put(false, "learning");
          tx.oncomplete = () => resolve();
        };
      }),
  );
  await say(page, "بعد شوية باش نعمل réunion و نبعث الميل");
  await page.getByRole("group").getByRole("button", { name: "15 min" }).click();
  await expect(page.getByText("Time set")).toBeVisible();
  expect(await facts(page)).toEqual([]);
});
