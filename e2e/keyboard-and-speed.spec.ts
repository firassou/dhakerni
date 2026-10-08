import { expect, test } from "@playwright/test";

const parse = (title: string, offsetMinutes: number | null) => ({
  tasks: [
    {
      title,
      notes: null,
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

test.beforeEach(async ({ page }) => {
  await page.route("**/api/parse", (route) => {
    const { text } = route.request().postDataJSON() as { text: string };
    return route.fulfill({ json: parse(text, text.includes("soon") ? 30 : null) });
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

test("everything works with the keyboard alone", async ({ page }) => {
  // add a task: focus the field, type, Enter
  await page.locator("#quick-add").focus();
  await page.keyboard.type("water plants");
  await page.keyboard.press("Enter");
  await expect(page.getByText("water plants")).toBeVisible();

  // toggle it done with Space on the checkbox button, undo with the toast button
  await page.getByRole("button", { name: "Mark as done" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Mark as done" })).toBeVisible();

  // open the editor from the keyboard, edit the title, close with Escape
  await page.getByRole("button", { name: /^Edit task/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Title").fill("water the plants");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("water the plants")).toBeVisible();

  // filters are real tabs reachable by focus
  const tab = page.getByRole("tab", { name: "All" });
  await tab.focus();
  await page.keyboard.press("Enter");
  await expect(tab).toHaveAttribute("aria-selected", "true");

  // the mic can be started and stopped without a pointer
  const mic = page.getByRole("button", { name: "Hold to talk" });
  await mic.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Stop and send" })).toBeVisible();
  await page.keyboard.press("Escape"); // cancels the recording
  await expect(page.getByRole("button", { name: "Hold to talk" })).toBeVisible();
});

test("focus is always visible", async ({ page }) => {
  await page.locator("#quick-add").focus();
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test("the Escape key closes dialogs and returns focus to where you were", async ({ page }) => {
  await page.locator("#quick-add").fill("a task");
  await page.locator("#quick-add").press("Enter");
  const edit = page.getByRole("button", { name: /^Edit task/ });
  await edit.click();
  await page.keyboard.press("Escape");
  await expect(edit).toBeFocused();
});

test.describe("interactions feel instant (optimistic updates, under 100 ms)", () => {
  /**
   * Time from the click event itself (not Playwright's own pre-click waiting) to the screen showing the
   * result, measured in the page on the same clock.
   */
  async function measure(
    page: import("@playwright/test").Page,
    act: () => Promise<void>,
    ready: string,
  ) {
    await page.evaluate((sel) => {
      const w = window as unknown as { __t?: number; __ms?: number };
      w.__t = undefined;
      w.__ms = undefined;
      document.addEventListener("click", (e) => (w.__t = e.timeStamp), {
        capture: true,
        once: true,
      });
      new MutationObserver((_, obs) => {
        if (w.__t !== undefined && document.querySelector(sel)) {
          w.__ms = performance.now() - w.__t;
          obs.disconnect();
        }
      }).observe(document.body, { childList: true, subtree: true, attributes: true });
    }, ready);
    await act();
    await page.waitForFunction(() => (window as unknown as { __ms?: number }).__ms !== undefined);
    return page.evaluate(() => (window as unknown as { __ms: number }).__ms);
  }

  test("completing a task and opening the editor", async ({ page }) => {
    await page.locator("#quick-add").fill("one");
    await page.locator("#quick-add").press("Enter");
    await expect(page.getByText("one", { exact: true })).toBeVisible();

    const done = await measure(
      page,
      () => page.getByRole("button", { name: "Mark as done" }).click(),
      '[aria-pressed="true"]',
    );
    const open = await measure(
      page,
      () => page.getByRole("button", { name: /^Edit task/ }).click(),
      '[role="dialog"]',
    );
    console.log(`complete: ${done.toFixed(0)} ms, open editor: ${open.toFixed(0)} ms`);
    expect(done).toBeLessThan(100);
    expect(open).toBeLessThan(100);
  });

  test("a typed task appears on screen right after the parse comes back", async ({ page }) => {
    const ms = await measure(
      page,
      async () => {
        await page.locator("#quick-add").fill("soon task");
        await page.locator("#quick-add").press("Enter");
      },
      '[aria-label="Edit task: soon task"], button[aria-label^="Edit task: soon"]',
    );
    console.log(`typed task visible after: ${ms.toFixed(0)} ms (mocked network)`);
    expect(ms).toBeLessThan(250); // includes the fake parse round trip and writing to IndexedDB
  });
});
