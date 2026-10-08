import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const when = (p: object) => ({
  kind: "none",
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
const base = {
  description: null,
  items: [],
  suggestedSteps: [],
  decision: null,
  priority: null,
  list: null,
  reminderId: null,
  recurrence: null,
  subtasks: [],
  uncertain: [],
};

const answers: Record<string, unknown> = {
  juice: {
    tasks: [
      {
        ...base,
        title: "Buy juice",
        description: "Buy two juice",
        items: [{ name: "juice", qty: 2, unit: null }],
        list: "shopping",
      },
    ],
    reminders: [],
  },
  clothes: {
    tasks: [
      {
        ...base,
        title: "nbadel 7wayji",
        description: "nbadel 7wayji 9bal ma tji x",
        reminderId: "r",
      },
    ],
    reminders: [{ id: "r", when: when({ kind: "anchor", anchor: "before_event" }) }],
  },
  trip: {
    tasks: [
      {
        ...base,
        title: "Travel to Sfax",
        description: "Travel to Sfax on Saturday",
        suggestedSteps: ["Book transport", "Pack", "Confirm hotel"],
      },
    ],
    reminders: [],
  },
  phone: {
    tasks: [
      {
        ...base,
        title: "Decide: new phone or repair",
        description:
          "Undecided between a new phone and repairing the old one; only the screen is broken",
        decision: {
          options: ["New phone", "Repair"],
          recommendation: "Repair",
          reason: "Only the screen is broken.",
        },
      },
    ],
    reminders: [],
  },
  groceries: {
    tasks: [
      {
        ...base,
        title: "نشري الحاجات",
        description: "نشري حليب وخبز",
        items: [
          { name: "حليب", qty: 2, unit: "ليتر" },
          { name: "خبز", qty: 3, unit: null },
          { name: "طماطم", qty: 1, unit: "كيلو" },
          { name: "بيض", qty: null, unit: null },
          { name: "جبن", qty: null, unit: null },
        ],
      },
    ],
    reminders: [],
  },
};

async function setup(page: Page) {
  await page.route("**/api/parse", (route) => {
    const { text } = route.request().postDataJSON() as { text: string };
    const key = Object.keys(answers).find((k) => text.includes(k)) ?? "juice";
    return route.fulfill({ json: answers[key] });
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

async function say(page: Page, text: string) {
  await page.getByLabel("Add a task").fill(text);
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

test.beforeEach(async ({ page }) => setup(page));

test("'two juice' becomes a short title plus a checkable quantity", async ({ page }) => {
  await say(page, "ill bought two juice");
  await page.getByRole("tab", { name: "All" }).click();
  const card = page.getByRole("listitem").filter({ hasText: "Buy juice" });
  await expect(card.getByRole("button", { name: /^Edit task: Buy juice$/ })).toBeVisible();
  await expect(card.getByText("Buy two juice")).toBeVisible(); // the fuller description
  await expect(card.getByRole("button", { name: "Check off juice" })).toHaveText("2× juice");

  // tick it off right from the card, e.g. while standing in the shop
  await card.getByRole("button", { name: "Check off juice" }).click();
  await expect(card.getByRole("button", { name: "Uncheck juice" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.reload();
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByRole("button", { name: "Uncheck juice" })).toBeVisible(); // remembered
});

test("the editor changes quantities and adds or removes items", async ({ page }) => {
  await say(page, "ill bought two juice");
  await page.getByRole("tab", { name: "All" }).click();
  await page.getByRole("button", { name: /^Edit task: Buy juice$/ }).click();
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("Quantity: juice").fill("3");
  await dialog.getByLabel("Item", { exact: true }).fill("bread");
  await dialog.getByLabel("Quantity", { exact: true }).fill("1");
  await dialog.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(dialog.getByText("3× juice")).toBeVisible();
  await expect(dialog.getByText("1× bread")).toBeVisible();

  await dialog.getByRole("button", { name: "Remove juice" }).click();
  await expect(dialog.getByText("3× juice")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Check off bread" })).toBeVisible();
});

test("a long list shows a few items and says how many more", async ({ page }) => {
  await say(page, "groceries please");
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByRole("button", { name: "Check off حليب" })).toHaveText("2 ليتر حليب");
  await expect(page.getByText("+1 more")).toBeVisible();
});

test("a Derja idea gets a clean title, the full wording as description, and a time question", async ({
  page,
}) => {
  await say(page, "clothes before x");
  await expect(page.getByRole("button", { name: /^Edit task: nbadel 7wayji$/ })).toBeVisible();
  await expect(page.getByText("nbadel 7wayji 9bal ma tji x")).toBeVisible();
  await expect(page.getByRole("group", { name: /[?؟]$/ })).toBeVisible(); // "before x" has no time yet: it asks
});

test("a big goal offers steps that only count once added", async ({ page }) => {
  await say(page, "trip to sfax");
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByText(/steps/)).toHaveCount(0); // suggestions are not steps
  await page.getByRole("button", { name: /^Edit task: Travel to Sfax$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Suggested steps")).toBeVisible();

  await dialog.getByRole("button", { name: "Add step: Book transport" }).click();
  await dialog.getByRole("button", { name: "Dismiss: Pack" }).click();
  await expect(dialog.getByRole("checkbox", { name: "Check off Book transport" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add step: Book transport" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Add step: Pack" })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Dismiss all" }).click();
  await expect(dialog.getByText("Suggested steps")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByText("0/1 steps")).toBeVisible();

  await page.getByRole("button", { name: /^Edit task: Travel to Sfax$/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: "Check off Book transport" })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("1/1 steps")).toBeVisible();
});

test("a decision shows the options and a labelled suggestion, and you can disagree", async ({
  page,
}) => {
  await say(page, "phone question");
  await page.getByRole("tab", { name: "All" }).click();
  const card = page.getByRole("listitem").filter({ hasText: "Decide: new phone or repair" });
  await expect(card.getByText("Decision", { exact: true })).toBeVisible();
  await expect(card.getByText("Suggestion: Repair")).toBeVisible();

  await card.getByRole("button", { name: /^Edit task/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("p", { hasText: "Suggestion:" })).toContainText(
    "Only the screen is broken.",
  );
  await dialog.getByRole("button", { name: "Choose New phone" }).click(); // free to pick the other option
  await expect(dialog.getByRole("button", { name: "Chosen: New phone" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(card.getByText("You chose: New phone")).toBeVisible();
});

test("the editor with items, steps, suggestions and a decision has no accessibility violations", async ({
  page,
}) => {
  await say(page, "trip to sfax");
  await page.getByRole("tab", { name: "All" }).click();
  await page.getByRole("button", { name: /^Edit task: Travel to Sfax$/ }).click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(600); // let the sheet finish appearing before measuring contrast
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);

  await page.keyboard.press("Escape");
  await say(page, "phone question");
  await page.getByRole("tab", { name: "All" }).click();
  await page.getByRole("button", { name: /^Edit task: Decide/ }).click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(600); // let the sheet finish appearing before measuring contrast
  const r2 = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    r2.violations.map((v) => `${v.id}: ${v.nodes[0]?.target} ${v.nodes[0]?.any[0]?.message}`),
  ).toEqual([]);
});

test("tasks saved before items, steps and decisions existed still open (no crash)", async ({
  page,
}) => {
  // exactly what v0.2 wrote: none of the later fields
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open("dhakerni");
        open.onsuccess = () => {
          const tx = open.result.transaction("tasks", "readwrite");
          tx.objectStore("tasks").put({
            id: "old-1",
            title: "نشري الخبز",
            notes: "",
            dueAt: null,
            reminders: [],
            priority: "normal",
            list: "inbox",
            recurrence: null,
            subtasks: [],
            uncertain: [],
            done: false,
            doneAt: null,
            order: 0,
            createdAt: "2026-10-08T09:00:00.000Z",
            updatedAt: "2026-10-08T09:00:00.000Z",
          });
          tx.oncomplete = () => resolve();
        };
      }),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.reload();
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByRole("button", { name: /^Edit task: نشري الخبز$/ })).toBeVisible();

  // and the new editor sections work on it
  await page.getByRole("button", { name: /^Edit task/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Item", { exact: true }).fill("milk");
  await dialog.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(dialog.getByText("milk")).toBeVisible();
  expect(errors).toEqual([]);
});
