import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // The parser is mocked: every typed text becomes one task with no time.
  await page.route("**/api/parse", (route) => {
    const { text } = route.request().postDataJSON() as { text: string };
    return route.fulfill({
      json: {
        tasks: [
          {
            title: text,
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

async function addTask(page: import("@playwright/test").Page, text: string) {
  await page.getByLabel("Add a task").fill(text);
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

test("add, complete with undo, edit, delete with undo", async ({ page }) => {
  await addTask(page, "buy bread");
  // typed tasks have no time yet, so they land in "Needs time"
  await expect(page.getByRole("tab", { name: "Needs time" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("buy bread")).toBeVisible();
  await expect(page.getByText("Task added")).toBeVisible();

  // survives reload (IndexedDB)
  await page.reload();
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByText("buy bread")).toBeVisible();

  // complete, then undo
  await page.getByRole("button", { name: "Mark as done" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Mark as done" })).toBeVisible();

  // edit title and give it a time -> moves to Today
  await page.getByRole("button", { name: /Edit task: buy bread/ }).click();
  await page.getByLabel("Title").fill("buy bread and milk");
  const soon = new Date(Date.now() + 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  await page
    .getByLabel("Due")
    .fill(
      `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`,
    );
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Today" }).click();
  await expect(page.getByText("buy bread and milk")).toBeVisible();

  // delete, then undo
  await page.getByRole("button", { name: /Edit task/ }).click();
  await page.getByRole("button", { name: "Delete task" }).click();
  await expect(page.getByText("buy bread and milk")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("buy bread and milk")).toBeVisible();

  // complete for real: appears under Done
  await page.getByRole("button", { name: "Mark as done" }).click();
  await page.getByRole("tab", { name: "Done" }).click();
  await expect(page.getByText("buy bread and milk")).toBeVisible();
  // and stays there: the fade-out is only for the list a finished task is leaving
  await page.waitForTimeout(800);
  await expect(page.getByRole("listitem").filter({ hasText: "buy bread and milk" })).toHaveCSS(
    "opacity",
    "1",
  );
});

test("the input takes several lines and grows", async ({ page, isMobile }) => {
  const field = page.getByLabel("Add a task");
  await field.focus();
  const oneLine = (await field.boundingBox())!.height;
  await page.keyboard.type("buy bread");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("and call mum");
  await expect(field).toHaveValue("buy bread\nand call mum");
  expect((await field.boundingBox())!.height).toBeGreaterThan(oneLine);

  // Enter sends with a keyboard; on a phone it is a new line and the button sends.
  await page.keyboard.press("Enter");
  if (isMobile) {
    await expect(field).toHaveValue("buy bread\nand call mum\n");
    await page.getByRole("button", { name: "Add", exact: true }).click();
  }
  await expect(page.getByRole("listitem").filter({ hasText: "and call mum" })).toBeVisible();
  await expect(field).toHaveValue("");
  expect((await field.boundingBox())!.height).toBe(oneLine);
});

test("tapping anywhere on a card opens the editor", async ({ page }) => {
  await addTask(page, "call the bank");
  const card = page.getByRole("listitem").filter({ hasText: "call the bank" });
  const box = (await card.boundingBox())!;
  // well to the right of the title text, on the card's empty space
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  // the checkbox still only checks
  await card.getByRole("button", { name: "Mark as done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a long press picks cards, and they are deleted together", async ({ page }) => {
  await addTask(page, "alpha");
  await addTask(page, "bravo");
  await addTask(page, "charlie");
  const card = (name: string) => page.getByRole("listitem").filter({ hasText: name });

  // hold the first one
  const box = (await card("alpha").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.getByText("1 selected")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0); // letting go does not open it

  // now a tap picks, and a second tap unpicks
  await card("bravo").click();
  await expect(page.getByText("2 selected")).toBeVisible();
  await card("charlie").click();
  await card("charlie").click();
  await expect(page.getByText("2 selected")).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("2 tasks deleted")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(card("charlie")).toBeVisible();
  await expect(page.getByLabel("Add a task")).toBeVisible(); // back to normal

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(3);
});

test("picking can be cancelled, and a short press never starts it", async ({ page }) => {
  await addTask(page, "alpha");
  const card = page.getByRole("listitem").filter({ hasText: "alpha" });
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.getByRole("button", { name: "Cancel selection" }).click();
  await expect(page.getByText("1 selected")).toHaveCount(0);
  await expect(card).toBeVisible();
});

test("finished tasks leave by themselves after a day", async ({ page }) => {
  await addTask(page, "old chore");
  await addTask(page, "fresh chore");
  for (const name of ["old chore", "fresh chore"]) {
    await page
      .getByRole("listitem")
      .filter({ hasText: name })
      .getByRole("button", { name: "Mark as done" })
      .click();
  }
  await page.getByRole("tab", { name: "Done" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("Finished tasks are removed after a day.")).toBeVisible();

  // pretend one was finished 25 hours ago
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("dhakerni");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("tasks", "readwrite");
          tx.oncomplete = () => resolve(); // only then is it really saved
          const store = tx.objectStore("tasks");
          const all = store.getAll();
          all.onsuccess = () => {
            const old = all.result.find((x) => x.title === "old chore");
            store.put({ ...old, doneAt: new Date(Date.now() - 25 * 3_600_000).toISOString() });
          };
        };
      }),
  );
  await page.reload();
  await page.getByRole("tab", { name: "Done" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("fresh chore")).toBeVisible();
});

test("reset everything asks first, then leaves the device empty", async ({ page }) => {
  await addTask(page, "to be wiped");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Reset everything" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/");
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByText("to be wiped")).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Reset everything" }).click();
  await page.getByRole("button", { name: "Yes, delete everything" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByText("No tasks yet")).toBeVisible();
});

/** Drag a finger across a card. Playwright's mouse is not a touch, so the pointer events are made by hand. */
async function swipe(page: import("@playwright/test").Page, name: string, byPx: number) {
  await page
    .getByRole("listitem")
    .filter({ hasText: name })
    .evaluate(async (li, by) => {
      const r = li.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const x0 = r.left + r.width / 2;
      const fire = (type: string, x: number) =>
        li.dispatchEvent(
          new PointerEvent(type, {
            pointerType: "touch",
            pointerId: 7,
            isPrimary: true,
            bubbles: true,
            clientX: x,
            clientY: y,
          }),
        );
      fire("pointerdown", x0);
      for (let i = 1; i <= 8; i++) {
        fire("pointermove", x0 + (by * i) / 8);
        await new Promise((r) => setTimeout(r, 40)); // slow: this is a drag, not a flick
      }
      fire("pointerup", x0 + by);
    }, byPx);
}

test.describe("swiping a card", () => {
  test.skip(({ isMobile }) => !isMobile, "a finger gesture");

  test("right finishes it, left deletes it, and both can be undone", async ({ page }) => {
    await addTask(page, "alpha");
    await addTask(page, "bravo");
    const card = (name: string) => page.getByRole("listitem").filter({ hasText: name });

    await swipe(page, "alpha", 220);
    await expect(page.getByText("Marked as done")).toBeVisible();
    await expect(card("alpha")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(card("alpha")).toBeVisible();

    await swipe(page, "bravo", -220);
    await expect(page.getByText("Task deleted")).toBeVisible();
    await expect(card("bravo")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(card("bravo")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0); // a swipe never opens the editor
  });

  test("a short swipe springs back and does nothing", async ({ page }) => {
    await addTask(page, "alpha");
    await swipe(page, "alpha", 60);
    await page.waitForTimeout(500);
    await expect(page.getByRole("listitem").filter({ hasText: "alpha" })).toBeVisible();
    await expect(page.getByText("Marked as done")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("in the Done list, right puts the task back", async ({ page }) => {
    await addTask(page, "alpha");
    await swipe(page, "alpha", 220);
    await page.getByRole("tab", { name: "Done" }).click();
    await swipe(page, "alpha", 220);
    await page.getByRole("tab", { name: "All" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "alpha" })).toBeVisible();
  });
});

test("keyboard reorder", async ({ page }) => {
  await addTask(page, "first");
  await addTask(page, "second"); // newest on top
  const items = page.getByRole("listitem");
  await expect(items.first()).toContainText("second");
  await page.getByRole("button", { name: "Reorder" }).first().focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(250);
  await page.keyboard.press("Space");
  await expect(items.first()).toContainText("first");
});
