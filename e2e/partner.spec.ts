import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { SharedTask } from "../src/lib/partner/shared";
import { memoryKv } from "../src/lib/server/memory-kv";
import * as pairing from "../src/lib/server/pairing";

// The real pairing and inbox logic, behind the API routes of two pretend devices: it checks the screens, the
// pair token on every call, and the whole send -> inbox -> list path without a Redis or a push service.
process.env.REMINDER_ENCRYPTION_KEY ??= Buffer.alloc(32, 5).toString("base64");

function fakeServer() {
  const { api } = memoryKv();
  const json = (body: unknown, status = 200) => ({ status, json: body });
  const fail = (error: string, status: number) => json({ error }, status);

  async function handle(path: string, method: string, h: Record<string, string>, body: unknown) {
    const sid = h["x-session-id"];
    if (path === "/api/pair/create") {
      const made = await pairing.createInvite(api, sid);
      return "error" in made ? fail(made.error, 409) : json(made);
    }
    if (path === "/api/pair/join") {
      const joined = await pairing.joinInvite(api, sid, (body as { code: string }).code);
      return "error" in joined ? fail(joined.error, 404) : json(joined);
    }
    if (path === "/api/pair/status") return json(await pairing.status(api, sid));
    const partner = await pairing.verify(api, sid, h["x-pair-token"] ?? "");
    if (!partner) return fail("not_paired", 401);
    if (path === "/api/pair/leave") {
      await pairing.leave(api, sid, partner);
      return json({ ok: true });
    }
    if (path === "/api/share/send") {
      const task = SharedTask.parse((body as { task: unknown }).task);
      const sent = await pairing.send(api, partner, task, new Date());
      return "error" in sent
        ? fail(sent.error, 429)
        : json({ ok: true, notified: false, id: sent.id });
    }
    if (path === "/api/share/status") {
      const { shareId, done } = body as { shareId: string; done: boolean };
      await pairing.sendStatus(api, partner, shareId, done, new Date());
      return json({ ok: true });
    }
    if (path === "/api/share/inbox") return json({ items: await pairing.inbox(api, sid) });
    if (path === "/api/share/ack") {
      await pairing.ack(api, sid, (body as { ids: string[] }).ids);
      return json({ ok: true });
    }
    return fail("not_found", 404);
  }

  return async (context: BrowserContext) => {
    await context.route(/\/api\/(pair|share)\//, async (route) => {
      const req = route.request();
      const body = req.method() === "POST" ? req.postDataJSON() : null;
      const out = await handle(new URL(req.url()).pathname, req.method(), req.headers(), body);
      await route.fulfill(out);
    });
  };
}

const parseOneTask = (page: Page) =>
  page.route("**/api/parse", (route) => {
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

test.describe("partner sharing", () => {
  test("pair with a code, send a task, it lands on the other device, then unpair", async ({
    browser,
  }) => {
    const serve = fakeServer();
    const opts = { baseURL: "http://localhost:3000" };
    const [ctxA, ctxB] = await Promise.all([browser.newContext(opts), browser.newContext(opts)]);
    await Promise.all([serve(ctxA), serve(ctxB)]);
    const [a, b] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);
    await parseOneTask(a);

    // A makes an invitation, naming the partner.
    await a.goto("/settings");
    await a.getByPlaceholder("e.g. Sami").fill("Lina");
    await a.getByRole("button", { name: "Invite someone" }).click();
    const code = (await a.getByTestId("invite-code").textContent())!.trim();
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);

    // B opens the link, names A, joins.
    await b.goto(`/join/${code}`);
    await b.getByPlaceholder("e.g. Sami").fill("Sami");
    await b.getByRole("button", { name: "Join", exact: true }).click();
    await expect(b.getByText("Paired with Sami")).toBeVisible();

    // A notices on its own, without a reload.
    await expect(a.getByText("Paired with Lina")).toBeVisible({ timeout: 10_000 });

    // The code is single use.
    const ctxC = await browser.newContext(opts);
    await serve(ctxC);
    const third = await ctxC.newPage();
    await third.goto(`/join/${code}`);
    await third.getByRole("button", { name: "Join", exact: true }).click();
    await expect(third.getByText("That code doesn't work")).toBeVisible();
    await ctxC.close();

    // A sends a task from its editor.
    await a.goto("/");
    await a.getByLabel("Add a task").fill("Buy bread");
    await a.getByRole("button", { name: "Add", exact: true }).click();
    await a.getByRole("button", { name: "Edit task", exact: false }).first().click();
    await a.getByTestId("send-to-partner").click();
    await expect(a.getByText("Sent to Lina").first()).toBeVisible();
    await a.keyboard.press("Escape");

    // It is on B's list, marked as from A, without B accepting anything.
    await b.goto("/");
    await expect(b.getByText("Buy bread", { exact: true })).toBeVisible();
    await expect(b.getByTestId("partner-badge")).toHaveText("From Sami");

    // Delivered once: the server's copy is gone, so a reload does not duplicate it.
    await b.reload();
    await b.getByRole("tab", { name: "All" }).click();
    await expect(b.getByText("Buy bread", { exact: true })).toHaveCount(1);

    // B finishes it: A's copy is finished too, without A doing anything but opening the app.
    await b.getByRole("tab", { name: "All" }).click();
    await b.getByRole("button", { name: "Mark as done" }).click();
    await expect(async () => {
      await a.goto("/");
      await a.getByRole("tab", { name: "Done" }).click();
      await expect(a.getByText("Buy bread", { exact: true })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    // A takes it back: B's copy is open again, and nothing bounces back to A.
    await a.getByRole("button", { name: "Mark as not done" }).click();
    await expect(async () => {
      await b.goto("/");
      await b.getByRole("tab", { name: "All" }).click();
      await expect(b.getByRole("button", { name: "Mark as done" })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    // A unpairs. B finds out the next time it looks, and the screen goes back to "not paired".
    await a.goto("/settings");
    await a.getByRole("button", { name: "Unpair" }).click();
    await a.getByRole("button", { name: "Unpair" }).last().click();
    await expect(a.getByRole("button", { name: "Invite someone" })).toBeVisible();
    await b.goto("/");
    await b.getByRole("tab", { name: "All" }).click();
    await expect(b.getByText("Buy bread", { exact: true })).toBeVisible(); // what was already delivered stays
    await b.goto("/settings");
    await expect(b.getByRole("button", { name: "Invite someone" })).toBeVisible();

    await Promise.all([ctxA.close(), ctxB.close()]);
  });
});
