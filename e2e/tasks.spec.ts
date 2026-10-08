import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
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
