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

test("holding the mic records, shows the waveform, and writes what it heard for review", async ({
  page,
}) => {
  const mic = page.getByRole("button", { name: "Hold to talk" });
  const box = (await mic.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByRole("button", { name: "Stop and send" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /0:0\d/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel recording" })).toBeVisible();
  await page.waitForTimeout(900);
  await page.mouse.up();

  // What was heard is not acted on yet: it sits in the field, where it can be fixed.
  const field = page.getByLabel("Add a task");
  await expect(field).toHaveValue("بعد 10 دقايق نطفي الفرن");
  await expect(page.getByText(/Check what I heard/)).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(0);

  // Sending it makes the task. 10 minutes from now is due today.
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("listitem").filter({ hasText: "نطفي الفرن" })).toBeVisible();
  await expect(field).toHaveValue("");
});

test("tap to talk keeps recording until Stop", async ({ page }) => {
  await page.getByRole("button", { name: "Hold to talk" }).click({ delay: 40 });
  const stop = page.getByRole("button", { name: "Stop and send" });
  await expect(stop).toBeVisible();
  await page.waitForTimeout(700);
  await stop.click();
  await expect(page.getByLabel("Add a task")).toHaveValue("بعد 10 دقايق نطفي الفرن");
});

test("parser failure still saves what was typed", async ({ page }) => {
  await page.getByLabel("Add a task").fill("fail please");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("fail please")).toBeVisible();
  await expect(page.getByText(/saved as written/)).toBeVisible();
});

test("the timer actually counts up while recording", async ({ page }) => {
  await page.getByRole("button", { name: "Hold to talk" }).click({ delay: 40 });
  await expect(page.getByRole("status").filter({ hasText: /0:0[2-9]/ })).toBeVisible({
    timeout: 6000,
  });
});

test.describe("cancelling a recording sends nothing to the AI", () => {
  let calls = 0;
  test.beforeEach(async ({ page }) => {
    calls = 0;
    await page.route("**/api/transcribe", (route) => {
      calls++;
      return route.fulfill({ json: { text: "x" } });
    });
    await page.route("**/api/parse", (route) => {
      calls++;
      return route.fulfill({ json: { tasks: [], reminders: [] } });
    });
  });

  test("the cancel button, in tap mode", async ({ page }) => {
    await page.getByRole("button", { name: "Hold to talk" }).click({ delay: 40 });
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Cancel recording" }).click();
    await expect(page.getByRole("button", { name: "Hold to talk" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(calls).toBe(0);
    await expect(page.getByText("Understanding…")).toHaveCount(0);
  });

  test("the cancel button is there while holding too", async ({ page }) => {
    const box = (await page.getByRole("button", { name: "Hold to talk" }).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByText("Slide away to cancel")).toBeVisible();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Cancel recording" }).dispatchEvent("click");
    await page.mouse.up();
    await expect(page.getByRole("button", { name: "Hold to talk" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(calls).toBe(0);
  });

  test("dragging the held mic away and letting go cancels", async ({ page }) => {
    const box = (await page.getByRole("button", { name: "Hold to talk" }).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.move(x - 140, y - 20, { steps: 6 });
    await expect(page.getByText("Release to cancel")).toBeVisible();
    await page.mouse.up();
    await expect(page.getByRole("button", { name: "Hold to talk" })).toBeVisible();
    await page.waitForTimeout(600);
    expect(calls).toBe(0);
    await expect(page.getByText("Understanding…")).toHaveCount(0);
  });

  test("dragging a little and letting go still sends", async ({ page }) => {
    const box = (await page.getByRole("button", { name: "Hold to talk" }).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.move(x + 20, y, { steps: 3 });
    await expect(page.getByText("Release to cancel")).toHaveCount(0);
    await page.mouse.up();
    await expect.poll(() => calls).toBeGreaterThan(0);
  });

  test("Escape cancels, even right after pressing the mic", async ({ page }) => {
    await page.getByRole("button", { name: "Hold to talk" }).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape"); // immediately: the microphone may still be starting
    await expect(page.getByRole("button", { name: "Hold to talk" })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByRole("button", { name: "Hold to talk" })).toBeVisible();
    expect(calls).toBe(0);
  });
});
