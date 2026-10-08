import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const iso = () => new Date().toISOString();
const fact = (key: string, value: string, source = "answer", confidence = 0.8) => ({
  id: key,
  key,
  value,
  source,
  confidence,
  updatedAt: iso(),
});

async function fresh(page: Page) {
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
  await page.reload(); // recreates the database
  await page.waitForTimeout(300);
}

const seed = (page: Page, facts: ReturnType<typeof fact>[]) =>
  page.evaluate(
    (rows) =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open("dhakerni");
        open.onsuccess = () => {
          const tx = open.result.transaction("profile", "readwrite");
          for (const r of rows) tx.objectStore("profile").put(r);
          tx.oncomplete = () => resolve();
        };
      }),
    facts,
  );

const readFacts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ key: string; value: string }[]>((resolve) => {
        const open = indexedDB.open("dhakerni");
        open.onsuccess = () => {
          const req = open.result.transaction("profile").objectStore("profile").getAll();
          req.onsuccess = () => resolve(req.result);
        };
      }),
  );

test.describe("what Dhakerni knows", () => {
  test.beforeEach(async ({ page }) => {
    await fresh(page);
    await seed(page, [
      fact("vague.شوية", "20"),
      fact("anchor.leave_work", "17:00", "behavior", 0.4),
      fact("priority.work", "high", "behavior", 0.9),
      fact("language.mix", "arabic+latin", "behavior", 0.9),
    ]);
  });

  test("lists every fact in plain words with where it came from, and flags untrusted ones", async ({
    page,
  }) => {
    await page.goto("/memory");
    await expect(
      page.getByRole("heading", { name: "What Dhakerni knows about you" }),
    ).toBeVisible();
    await expect(page.getByText("“شوية” = 20 min")).toBeVisible();
    await expect(page.getByText("After work ≈ 17:00")).toBeVisible();
    await expect(page.getByText("work tasks: usually high")).toBeVisible();
    await expect(page.getByText("You mix Arabic with French or English words")).toBeVisible();
    await expect(page.getByText("You told me").first()).toBeVisible();
    await expect(page.getByText("Noticed from your habits").first()).toBeVisible();
    // the 17:00 habit has only been noticed once, so it says it is not used yet
    await expect(page.getByText("Not used yet. It starts once it repeats.")).toHaveCount(1);
  });

  test("edit changes a value and makes it fully trusted", async ({ page }) => {
    await page.goto("/memory");
    await page.getByRole("button", { name: /Edit: .*17:00/ }).click();
    await page.getByLabel("Value").fill("18:30");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("After work ≈ 18:30")).toBeVisible();
    await expect(page.getByText("You set this")).toBeVisible();
    await expect(page.getByText("Not used yet. It starts once it repeats.")).toHaveCount(0);
  });

  test("delete can be undone", async ({ page }) => {
    await page.goto("/memory");
    await page.getByRole("button", { name: /Delete: .*شوية/ }).click();
    await expect(page.getByText("“شوية” = 20 min")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("“شوية” = 20 min")).toBeVisible();
  });

  test("forget everything asks first, then deletes it all", async ({ page }) => {
    await page.goto("/memory");
    await page.getByRole("button", { name: "Forget everything" }).click();
    await expect(
      page.getByText("Delete everything Dhakerni has learned about you? Your tasks stay."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    expect(await readFacts(page)).toHaveLength(4); // cancelling deletes nothing

    await page.getByRole("button", { name: "Forget everything" }).click();
    await page.getByRole("button", { name: "Yes, forget it all" }).click();
    await expect(page.getByText(/Nothing learned yet/)).toBeVisible();
    expect(await readFacts(page)).toEqual([]);
  });

  test("the learning switch stops new facts but keeps using old ones", async ({ page }) => {
    await page.route("**/api/parse", (route) =>
      route.fulfill({
        json: {
          tasks: [
            {
              title: "x",
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
                kind: "vague",
                day: null,
                weekday: null,
                date: null,
                time: null,
                dayPart: null,
                offsetMinutes: null,
                vagueWord: "بعد شوية",
                anchor: null,
                confidence: 1,
              },
            },
          ],
        },
      }),
    );
    await page.goto("/memory");
    await page.getByRole("switch", { name: "Keep learning" }).click();
    await expect(page.getByText(/Learning is off/)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("switch", { name: "Keep learning" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await page.goto("/");
    await page.getByLabel("Add a task").fill("بعد شوية x");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    // the stored meaning of the word is still used: no question, a chip shows the guess
    await expect(page.getByRole("button", { name: /“شوية” = 20 min/ }).first()).toBeVisible();
    expect(await readFacts(page)).toHaveLength(4); // nothing new saved
  });
});

test("only the relevant slice of the profile is sent to the AI", async ({ page }) => {
  await fresh(page);
  await seed(page, [
    fact("vague.شوية", "20"),
    fact("vague.بعدين", "60"),
    fact("anchor.leave_work", "17:00"),
    fact("frequent.private thing", "5", "behavior", 0.9),
    fact("language.mix", "arabic+latin", "behavior", 0.9),
  ]);
  await page.reload();
  await page.waitForTimeout(500);

  let body: { hints?: string[] } = {};
  await page.route("**/api/parse", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({
      json: {
        tasks: [
          {
            title: "x",
            notes: null,
            priority: null,
            list: null,
            reminderId: null,
            recurrence: null,
            subtasks: [],
            uncertain: [],
          },
        ],
        reminders: [],
      },
    });
  });
  await page.getByLabel("Add a task").fill("بعد شوية نعمل réunion");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect.poll(() => body.hints?.length ?? 0).toBeGreaterThan(0);

  const sent = JSON.stringify(body.hints);
  expect(sent).toContain("شوية");
  expect(sent).toContain("mix Arabic-script");
  expect(sent).not.toContain("بعدين");
  expect(sent).not.toContain("17:00");
  expect(sent).not.toContain("private thing");
});

test.describe("backup", () => {
  test("export then import restores tasks and the learned profile", async ({ page }, testInfo) => {
    await fresh(page);
    await seed(page, [fact("vague.شوية", "20")]);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const open = indexedDB.open("dhakerni");
          open.onsuccess = () => {
            const tx = open.result.transaction("tasks", "readwrite");
            const now = new Date().toISOString();
            tx.objectStore("tasks").put({
              id: "t1",
              title: "نشري الخبز",
              notes: "",
              dueAt: null,
              reminders: [],
              priority: "normal",
              list: "inbox",
              recurrence: null,
              subtasks: [],
              uncertain: [],
              needs: null,
              assumed: null,
              timeBy: null,
              anchor: null,
              notifiedAt: null,
              done: false,
              doneAt: null,
              order: 0,
              createdAt: now,
              updatedAt: now,
            });
            tx.oncomplete = () => resolve();
          };
        }),
    );

    await page.goto("/settings");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^dhakerni-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const path = testInfo.outputPath("backup.json");
    await download.saveAs(path);
    const saved = JSON.parse(readFileSync(path, "utf8"));
    expect(saved).toMatchObject({
      app: "dhakerni",
      tasks: [{ title: "نشري الخبز" }],
      profile: [{ key: "vague.شوية", value: "20" }],
    });
    expect(JSON.stringify(saved)).not.toContain("sessionId");

    // wipe, then restore with "Replace everything"
    await page.goto("/memory");
    await page.getByRole("button", { name: "Forget everything" }).click();
    await page.getByRole("button", { name: "Yes, forget it all" }).click();
    expect(await readFacts(page)).toEqual([]);

    await page.goto("/settings");
    await page.getByLabel("Import").setInputFiles(path);
    await expect(page.getByText(/How should I import/)).toBeVisible();
    await page.getByRole("button", { name: /Replace everything/ }).click();
    await expect(page.getByText("Imported 1 tasks and 1 learned facts.")).toBeVisible();
    await page.waitForLoadState("load");
    await page.waitForTimeout(1600);
    expect(await readFacts(page)).toMatchObject([{ key: "vague.شوية", value: "20" }]);
  });

  test("a file that is not a backup is refused clearly", async ({ page }, testInfo) => {
    await page.goto("/settings");
    const fs = await import("node:fs");
    const bad = testInfo.outputPath("bad.json");
    fs.writeFileSync(bad, JSON.stringify({ hello: "world" }));
    await page.getByLabel("Import").setInputFiles(bad);
    await expect(page.getByText("That isn't a Dhakerni backup.")).toBeVisible();
  });
});
