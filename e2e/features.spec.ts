import { expect, test, type Page } from "@playwright/test";

const when = (p: object) => ({
  kind: "relative",
  day: null,
  weekday: null,
  date: null,
  time: null,
  dayPart: null,
  offsetMinutes: null,
  vagueWord: null,
  anchor: null,
  anchorLabel: null,
  leadMinutes: null,
  confidence: 0.9,
  ...p,
});
const task = (title: string, extra: object = {}) => ({
  title,
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
  ...extra,
});
const milk = { name: "milk", qty: null, unit: null };

/** One canned answer per sentence, and a record of what the app sent. */
async function mockParse(page: Page, sent: { openTasks?: unknown; hints?: string[] }[]) {
  await page.route("**/api/parse", (route) => {
    const body = route.request().postDataJSON() as {
      text: string;
      openTasks?: { ref: string }[];
      hints?: string[];
    };
    sent.push(body);
    const { text } = body;
    if (text.startsWith("every day"))
      return route.fulfill({
        json: {
          tasks: [
            task("take vitamins", {
              reminderId: "r",
              recurrence: { freq: "daily", interval: 1, byWeekday: null },
            }),
          ],
          reminders: [{ id: "r", when: when({ offsetMinutes: 5 }) }],
          edits: [],
        },
      });
    if (text.includes("Sami"))
      return route.fulfill({
        json: {
          tasks: [task("tidy the room", { reminderId: "r" })],
          reminders: [
            {
              id: "r",
              when: when({ kind: "anchor", anchor: "sami_arrives", anchorLabel: "Sami arrives" }),
            },
          ],
          edits: [],
        },
      });
    if (text === "groceries")
      return route.fulfill({
        json: {
          tasks: [task("Groceries", { list: "shopping", items: [{ ...milk, name: "bread" }] })],
          reminders: [],
          edits: [],
        },
      });
    if (text === "add milk")
      return route.fulfill({
        json: {
          tasks: [task("Buy milk", { list: "shopping", items: [milk] })],
          reminders: [],
          edits: [],
        },
      });
    if (text === "I finished the report")
      return route.fulfill({
        json: {
          tasks: [],
          reminders: [],
          edits: [
            {
              ref: body.openTasks?.[0]?.ref ?? "none",
              action: "complete",
              reminderId: null,
              item: null,
            },
          ],
        },
      });
    return route.fulfill({ json: { tasks: [task(text)], reminders: [], edits: [] } });
  });
}

async function add(page: Page, text: string) {
  await page.getByLabel("Add a task").fill(text);
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

let sent: { openTasks?: unknown; hints?: string[] }[];

test.beforeEach(async ({ page }) => {
  sent = [];
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
  await mockParse(page, sent);
  await page.route("**/api/push/key", (r) => r.fulfill({ json: { enabled: false, key: null } }));
  await page.reload();
});

test("finishing a repeating task moves it to its next date, and Undo puts it back", async ({
  page,
}) => {
  await add(page, "every day take vitamins");
  await page.getByRole("tab", { name: "All" }).click();
  const card = page.getByRole("listitem").filter({ hasText: "take vitamins" });
  await expect(card.getByTestId("repeats")).toHaveText("Daily");
  await expect(card.getByTestId("remaining")).toHaveText(/minutes/);

  await card.getByRole("button", { name: "Mark as done" }).click();
  await expect(page.getByText(/Done\. Next:/)).toBeVisible();
  // Still open, now a day away.
  await expect(card.getByRole("button", { name: "Mark as done" })).toBeVisible();
  await expect(card.getByTestId("remaining")).toHaveText(/tomorrow|hours/);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(card.getByTestId("remaining")).toHaveText(/minutes/);
});

test("an event the app has no name for gets a trigger in the person's words", async ({ page }) => {
  await add(page, "tidy the room before Sami arrives");
  const trigger = page
    .getByRole("group", { name: "Triggers" })
    .getByRole("button", { name: "Now: Sami arrives" });
  await trigger.click();
  await expect(
    page.getByRole("region", { name: "Reminders due" }).getByText("tidy the room"),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Triggers" })).toHaveCount(0);
});

test("a thing named for an open list joins it instead of becoming a task", async ({ page }) => {
  await add(page, "groceries");
  await expect(page.getByRole("button", { name: "Check off bread" })).toBeVisible();
  await add(page, "add milk");
  await expect(page.getByText("Updated: Groceries")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check off milk" })).toBeVisible();
  await expect(page.getByText("Buy milk")).toHaveCount(0);
  // The parser was told a list is open, by its category only.
  expect(sent[1].hints?.join(" ")).toContain('"shopping"');
  expect(sent[1].hints?.join(" ")).not.toContain("bread");
});

test("a sentence about a task that is already there changes it, and only that one is sent", async ({
  page,
}) => {
  await add(page, "write the report");
  await add(page, "call the bank");
  await add(page, "I finished the report");
  await expect(page.getByText("Updated: write the report")).toBeVisible();
  expect(sent[2].openTasks).toEqual([{ ref: "t1", title: "write the report" }]);
  await page.getByRole("tab", { name: "Done" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "write the report" })).toBeVisible();
  await expect(page.getByText("I finished the report")).toHaveCount(0);
});

test("text shared from another app lands in the field, to be checked", async ({ page }) => {
  await page.goto("/?text=call%20the%20plumber&url=https%3A%2F%2Fexample.com");
  await expect(page.getByLabel("Add a task")).toHaveValue("call the plumber\nhttps://example.com");
  await expect(page).toHaveURL(/\/$/);
});

test("the manifest lets other apps share into Dhakerni", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.share_target).toMatchObject({ action: "/", method: "GET" });
});

test("settings offer the evening summary and Ramadan, and remember them", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("switch", { name: "Evening summary" }).click();
  await page.getByLabel("Ramadan").selectOption("on");
  await expect(page.getByText(/Ramadan is on/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Evening summary" })).toBeChecked();
  await expect(page.getByLabel("Ramadan")).toHaveValue("on");
});
