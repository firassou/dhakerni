import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// A 1x1 PNG: the app decodes and re-encodes the photo before sending it, so it must be a real image.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const localDate = (daysAhead: number) => {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

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

const draft = (over: object = {}) => ({
  provider: "STEG",
  amountMillimes: 45_300,
  dueDate: localDate(3),
  reference: "1234567",
  periodFrom: "2026-06-03",
  periodTo: "2026-10-06",
  uncertain: [],
  ...over,
});

test.describe("bills", () => {
  test("a photo becomes a bill with a reminder, and paying it updates the totals", async ({
    page,
  }) => {
    let uploads = 0;
    await page.route("**/api/bill", async (route) => {
      uploads++;
      expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
      await route.fulfill({ json: draft({ uncertain: ["reference"] }) });
    });
    await reset(page);

    await page.getByTestId("bill-file").setInputFiles({
      name: "bill.png",
      mimeType: "image/png",
      buffer: PNG,
    });

    const sheet = page.getByRole("dialog");
    await expect(sheet.getByLabel("Who to pay")).toHaveValue("STEG");
    await expect(sheet.getByLabel("Amount (DT)")).toHaveValue("45.300");
    await expect(sheet.getByTestId("bill-amount-preview")).toHaveText("45.300 DT");
    await expect(sheet.getByLabel("Period start")).toHaveValue("2026-06-03");
    await expect(sheet.getByLabel("Period end")).toHaveValue("2026-10-06");
    await expect(sheet.getByText("Please check")).toBeVisible(); // the reference was unsure
    expect(uploads).toBe(1);

    await sheet.getByRole("button", { name: "Add bill" }).click();
    await expect(sheet).toBeHidden();
    // It is a task like any other, with its amount, and it is due in three days.
    await page.getByRole("tab", { name: "Upcoming" }).click();
    const card = page.getByRole("listitem").filter({ hasText: "STEG" });
    await expect(card).toContainText("45.300 DT");

    await page.getByRole("link", { name: "Bills" }).click();
    await expect(page.getByTestId("bill-row")).toHaveCount(1);
    await expect(page.getByTestId("bill-amount")).toHaveText("45.300 DT");
    await expect(page.getByText("Due this week")).toBeVisible();
    await expect(page.getByTestId("bill-row")).toContainText("Period:");

    await page.getByRole("button", { name: "Mark paid" }).click();
    await expect(page.getByTestId("month-paid")).toHaveText("45.300 DT");
    await expect(page.getByRole("heading", { name: "Paid" })).toBeVisible();

    // The paid bill is kept across a reload, and can be reopened.
    await page.reload();
    await expect(page.getByTestId("month-paid")).toHaveText("45.300 DT");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("month-paid")).toHaveText("0.000 DT");
  });

  test("a monthly bill moves on to next month when paid, and keeps a paid copy", async ({
    page,
  }) => {
    await page.route("**/api/bill", (route) =>
      route.fulfill({ json: draft({ dueDate: localDate(5) }) }),
    );
    await reset(page);
    await page.getByTestId("bill-file").setInputFiles({
      name: "bill.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Repeats every month").check();
    await sheet.getByRole("button", { name: "Add bill" }).click();

    await page.getByRole("link", { name: "Bills" }).click();
    await page.getByRole("button", { name: "Mark paid" }).click();
    // One paid, one still to pay (next month).
    await expect(page.getByTestId("bill-row")).toHaveCount(2);
    await expect(page.getByText("Every month")).toBeVisible();
  });

  test("when reading fails the bill can be filled in by hand", async ({ page }) => {
    await page.route("**/api/bill", (route) =>
      route.fulfill({ status: 502, json: { error: "x" } }),
    );
    await reset(page);
    await page.getByTestId("bill-file").setInputFiles({
      name: "bill.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("alert")).toContainText("couldn’t read");
    await sheet.getByRole("button", { name: "Fill it in by hand" }).click();

    const save = sheet.getByRole("button", { name: "Add bill" });
    await expect(save).toBeDisabled();
    await sheet.getByLabel("Who to pay").fill("Ooredoo");
    await sheet.getByLabel("Amount (DT)").fill("1 234,500");
    await expect(sheet.getByTestId("bill-amount-preview")).toHaveText("1,234.500 DT");
    await sheet.getByLabel("Due date").fill(localDate(2));
    await expect(save).toBeEnabled();
    await save.click();

    await page.getByRole("link", { name: "Bills" }).click();
    await expect(page.getByTestId("bill-amount")).toHaveText("1,234.500 DT");
  });

  test("pasted text goes through the same check", async ({ page }) => {
    let body = "";
    await page.route("**/api/bill", async (route) => {
      body = route.request().postData() ?? "";
      await route.fulfill({ json: draft({ provider: "Ooredoo", amountMillimes: 19_900 }) });
    });
    await reset(page);
    await page.goto("/bills");
    await page.getByRole("button", { name: "Paste a message" }).click();
    await page
      .getByRole("dialog")
      .getByRole("textbox")
      .fill("Ooredoo: facture 19,900 DT avant le 30/11");
    await page.getByRole("button", { name: "Read it" }).click();
    await expect(page.getByLabel("Who to pay")).toHaveValue("Ooredoo");
    expect(body).toContain("Ooredoo: facture");
  });

  test("the bills screen has no accessibility violations", async ({ page }) => {
    await page.route("**/api/bill", (route) => route.fulfill({ json: draft() }));
    await reset(page);
    await page.getByTestId("bill-file").setInputFiles({
      name: "bill.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.getByRole("dialog").getByLabel("Who to pay")).toBeVisible();
    await page.waitForTimeout(600); // let the sheet and the fields finish arriving
    const review = await new AxeBuilder({ page }).analyze();
    expect(review.violations).toEqual([]);
    await page.getByRole("button", { name: "Add bill" }).click();
    await page.goto("/bills");
    await expect(page.getByTestId("bill-row")).toBeVisible();
    await page.waitForTimeout(600);
    const screen = await new AxeBuilder({ page }).analyze();
    expect(screen.violations).toEqual([]);
  });
});
