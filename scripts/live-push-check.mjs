// Real end-to-end Web Push check: browser -> push service -> our server -> push service -> service worker.
//
// Needs: internet, real Google Chrome (the bundled Chromium cannot register with Google's push service),
// `npm run dev` and `npm run dev:cron` running, and valid VAPID + Upstash env in .env.local.
// Usage:  node scripts/live-push-check.mjs        (APP_URL=https://... to test a deployment)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
};

// A persistent profile: Chrome refuses Web Push in incognito-style sessions, which a plain context is.
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "dhakerni-push-")), {
  channel: "chrome",
  permissions: ["notifications"],
  baseURL: BASE,
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.route("**/api/parse", (route) => {
  const { text } = route.request().postDataJSON();
  return route.fulfill({
    json: {
      tasks: [
        {
          title: text,
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
            kind: "relative",
            day: null,
            weekday: null,
            date: null,
            time: null,
            dayPart: null,
            offsetMinutes: 1,
            vagueWord: null,
            anchor: null,
            confidence: 1,
          },
        },
      ],
    },
  });
});

try {
  console.log("1. turn notifications on (real subscription with Google's push service)");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Turn on" }).click({ timeout: 15_000 });
  await page.getByText(/On\. Reminders arrive/).waitFor({ timeout: 30_000 });

  console.log("2. add a task due in 1 minute (the app syncs it to the server, encrypted)");
  await page.goto("/");
  const title = `live push ${Date.now()}`;
  await page.getByLabel("Add a task").fill(title);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByText(title).first().waitFor();
  await page.waitForTimeout(3000);

  console.log(
    "3. leave the home screen, so its in-app timer is gone and only a real push can notify",
  );
  await page.goto("/settings");

  console.log("4. waiting for the server to push it (about 1 to 2 minutes)...");
  const deadline = Date.now() + 170_000;
  let titles = [];
  while (Date.now() < deadline) {
    titles = await page.evaluate(async () =>
      (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => n.title),
    );
    if (titles.includes(title)) break;
    await page.waitForTimeout(3000);
  }
  if (!titles.includes(title))
    fail(`no notification arrived. Is the scheduler running? saw: ${JSON.stringify(titles)}`);
  else {
    console.log(`   notification received: "${title}"`);
    // Read the tasks back through the app's own page (a fresh navigation avoids a stale execution context).
    await page.goto("/");
    const notified = await Promise.race([
      page.evaluate(
        (wanted) =>
          new Promise((resolve) => {
            const open = indexedDB.open("dhakerni");
            open.onsuccess = () => {
              const req = open.result.transaction("tasks").objectStore("tasks").getAll();
              req.onsuccess = () =>
                resolve(
                  req.result.some((t) => t.title === wanted && !!t.notifiedAt) ||
                    `not marked: ${JSON.stringify(req.result.map((t) => [t.title, t.notifiedAt]))}`,
                );
            };
          }),
        title,
      ),
      new Promise((resolve) => setTimeout(() => resolve("timed out reading IndexedDB"), 15_000)),
    ]);
    if (notified !== true)
      fail(`the service worker did not mark the task as notified: ${notified}`);
    else
      console.log(
        "PASS: real Web Push delivered a reminder while the app's home screen was closed",
      );
  }
} catch (e) {
  fail(e.message.split("\n")[0]);
} finally {
  await ctx.close();
}
