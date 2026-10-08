import { expect, test, type Page } from "@playwright/test";

const parse = (title: string, offsetMinutes: number | null) => ({
  tasks: [
    {
      title,
      description: null,
      items: [],
      suggestedSteps: [],
      decision: null,
      priority: null,
      list: null,
      reminderId: offsetMinutes ? "r" : null,
      recurrence: null,
      subtasks: [],
      uncertain: [],
    },
  ],
  reminders: offsetMinutes
    ? [
        {
          id: "r",
          when: {
            kind: "relative",
            day: null,
            weekday: null,
            date: null,
            time: null,
            dayPart: null,
            offsetMinutes,
            vagueWord: null,
            anchor: null,
            confidence: 1,
          },
        },
      ]
    : [],
});

async function setup(page: Page) {
  await page.route("**/api/parse", (route) => {
    const { text } = route.request().postDataJSON() as { text: string };
    const m = /in (\d+)m/.exec(text);
    return route.fulfill({ json: parse(text, m ? Number(m[1]) : null) });
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
}

async function add(page: Page, text: string) {
  await page.getByLabel("Add a task").fill(text);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: `Edit task: ${text}` })).toBeVisible();
}

const center = async (page: Page, name: string | RegExp) => {
  const box = (await page.getByRole("button", { name }).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test.beforeEach(async ({ page }) => setup(page));

test.describe("dragging to reorder always shows what is happening", () => {
  test.beforeEach(async ({ page }) => {
    await add(page, "first");
    await add(page, "second");
    await add(page, "third"); // newest on top: third, second, first
    await page.getByRole("tab", { name: "Needs time" }).click();
  });

  test("a lifted copy follows the pointer, a placeholder marks the spot, neighbours glide aside", async ({
    page,
  }) => {
    const items = page.getByRole("listitem");
    await expect(items.first()).toContainText("third");
    const grip = await center(page, "Reorder");

    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.mouse.move(grip.x, grip.y + 10, { steps: 3 });

    // 1. the card in your hand
    const lifted = page.locator("[data-drag-overlay]");
    await expect(lifted).toBeVisible();
    await expect(lifted).toContainText("third");
    const before = (await lifted.boundingBox())!;

    // 2. the placeholder left behind
    await expect(items.first()).toHaveAttribute("data-dragging", "true");
    await expect(items.first()).toHaveClass(/drag-ghost/);

    // 3. it follows the pointer
    await page.mouse.move(grip.x, grip.y + 90, { steps: 8 });
    const after = (await lifted.boundingBox())!;
    expect(after.y).toBeGreaterThan(before.y + 50);

    // 4. the one it is passing slides out of the way, with a smooth transition (not a jump)
    const second = items.nth(1);
    await expect
      .poll(() => second.evaluate((el) => getComputedStyle(el).transform))
      .not.toBe("none");
    const transition = await second.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(transition).toMatch(/0\.26s/);

    // 5. letting go: the order changed, it settles into place, and the landing spot is highlighted
    await page.mouse.up();
    await expect(lifted).toHaveCount(0);
    await expect(items.first()).not.toContainText("third");
    await expect(page.getByRole("listitem").filter({ hasText: "third" })).toHaveClass(
      /drop-settle/,
    );
    await expect(page.getByRole("listitem").filter({ hasText: "third" })).not.toHaveClass(
      /drop-settle/,
      { timeout: 3000 },
    );
  });

  test("letting go without moving far changes nothing and says nothing", async ({ page }) => {
    const items = page.getByRole("listitem");
    const grip = await center(page, "Reorder");
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.mouse.move(grip.x, grip.y + 6, { steps: 2 });
    await page.mouse.up();
    await expect(items.first()).toContainText("third");
    await expect(page.locator(".drop-settle")).toHaveCount(0);
  });

  test("the keyboard gets the same visual feedback and spoken announcements", async ({ page }) => {
    const items = page.getByRole("listitem");
    await page.getByRole("button", { name: "Reorder" }).first().focus();
    await page.keyboard.press("Space");
    await expect(page.locator("[data-drag-overlay]")).toBeVisible();
    await expect(
      page.locator('[role="status"]').filter({ hasText: "Picked up third. Position 1 of 3." }),
    ).toHaveCount(1);
    await page.waitForTimeout(250);
    await page.keyboard.press("ArrowDown");
    await expect(
      page.locator('[role="status"]').filter({ hasText: /third moved to position 2 of 3/ }),
    ).toHaveCount(1);
    await page.waitForTimeout(250);
    await page.keyboard.press("Space");
    await expect(
      page.locator('[role="status"]').filter({ hasText: /third dropped at position 2 of 3/ }),
    ).toHaveCount(1);
    await expect(items.nth(1)).toContainText("third");
  });

  test("Escape cancels a drag and the card returns", async ({ page }) => {
    const items = page.getByRole("listitem");
    await page.getByRole("button", { name: "Reorder" }).first().focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(250);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(250);
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    await expect(items.first()).toContainText("third");
    await expect(page.locator('[role="status"]').filter({ hasText: /Move cancelled/ })).toHaveCount(
      1,
    );
  });
});

test.describe("other actions show what happened too", () => {
  test("a deleted card visibly leaves, and Undo brings it back", async ({ page }) => {
    await add(page, "to delete");
    await page.getByRole("tab", { name: "Needs time" }).click();
    await page.getByRole("button", { name: /^Edit task: to delete$/ }).click();
    await page.getByRole("button", { name: "Delete task" }).click();
    const card = page.getByRole("listitem").filter({ hasText: "to delete" });
    await expect(card).toHaveClass(/card-out/); // it is animating away, not vanishing
    await expect(card).toHaveCount(0, { timeout: 2000 });
    await expect(page.getByText("Task deleted")).toBeVisible();

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "to delete" })).toBeVisible();
  });

  test("a completed card fades out as the check lands, not abruptly", async ({ page }) => {
    await add(page, "finish me");
    await page.getByRole("tab", { name: "Needs time" }).click();
    await page.getByRole("button", { name: "Mark as done" }).click();
    const card = page.getByRole("listitem").filter({ hasText: "finish me" });
    await expect(card).toHaveClass(/card-done-out/);
    await expect(card).toHaveCount(0, { timeout: 2000 });
  });
});

test.describe("time remaining", () => {
  test("upcoming tasks show a casual 'in 25 minutes'", async ({ page }) => {
    await add(page, "soon in 25m");
    await page.getByRole("tab", { name: "Today" }).click();
    const card = page.getByRole("listitem").filter({ hasText: "soon in 25m" });
    await expect(card.getByTestId("remaining")).toHaveText(/in (24|25) minutes/);
  });

  test("no remaining time for tasks without a time or already done", async ({ page }) => {
    await add(page, "no time at all");
    await page.getByRole("tab", { name: "Needs time" }).click();
    await expect(page.getByTestId("remaining")).toHaveCount(0);

    await add(page, "later in 90m");
    await page.getByRole("tab", { name: "Today" }).click();
    await expect(page.getByTestId("remaining")).toHaveText(/in 2 hours/);
    await page.getByRole("button", { name: "Mark as done" }).click();
    await page.getByRole("tab", { name: "Done" }).click();
    await expect(page.getByTestId("remaining")).toHaveCount(0);
  });

  test("it counts down as time passes", async ({ page }) => {
    await page.clock.install();
    await page.reload();
    await add(page, "tick in 25m");
    await page.getByRole("tab", { name: "Today" }).click();
    await expect(page.getByTestId("remaining")).toHaveText(/in 2[45] minutes/);
    await page.clock.fastForward(10 * 60_000);
    await expect(page.getByTestId("remaining")).toHaveText(/in 1[45] minutes/);
  });
});
