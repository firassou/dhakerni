import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";
import {
  fireDue,
  SyncBody,
  syncReminders,
  type ReminderStore,
  type Subscription,
} from "./reminders";

beforeAll(() => {
  process.env.REMINDER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

/** In-memory store with the same claim semantics as Redis. */
function memoryStore() {
  const kv = new Map<string, string>();
  const due = new Map<string, number>();
  const ids = new Map<string, Set<string>>();
  const store: ReminderStore = {
    async putSub(sid, enc) {
      kv.set(`sub:${sid}`, enc);
    },
    async getSub(sid) {
      return kv.get(`sub:${sid}`) ?? null;
    },
    async delSub(sid) {
      kv.delete(`sub:${sid}`);
    },
    async putReminder(sid, t, enc, at) {
      kv.set(`r:${sid}:${t}`, enc);
      due.set(`${sid}:${t}`, at);
      (ids.get(sid) ?? ids.set(sid, new Set()).get(sid)!).add(t);
    },
    async getReminder(sid, t) {
      return kv.get(`r:${sid}:${t}`) ?? null;
    },
    async listTaskIds(sid) {
      return [...(ids.get(sid) ?? [])];
    },
    async delReminder(sid, t) {
      kv.delete(`r:${sid}:${t}`);
      due.delete(`${sid}:${t}`);
      ids.get(sid)?.delete(t);
    },
    async claimDue(now, limit) {
      const out: { sid: string; taskId: string }[] = [];
      for (const [m, at] of [...due]) {
        if (at <= now && out.length < limit) {
          due.delete(m);
          const i = m.indexOf(":");
          out.push({ sid: m.slice(0, i), taskId: m.slice(i + 1) });
        }
      }
      return out;
    },
  };
  return { store, kv, due };
}

const sub: Subscription = {
  endpoint: "https://updates.push.services.mozilla.com/wpush/v2/abc",
  keys: { p256dh: "p", auth: "a" },
};
const now = new Date("2026-10-08T10:00:00Z");
const body = (reminders: SyncBody["reminders"], mode: SyncBody["mode"] = "replace"): SyncBody => ({
  subscription: sub,
  mode,
  forget: false,
  reminders,
});
const at = (min: number) => new Date(now.getTime() + min * 60_000).toISOString();

describe("crypto", () => {
  it("round-trips and never stores plaintext", () => {
    const enc = encrypt("اشري الحليب");
    expect(enc).not.toContain("اشري");
    expect(decrypt(enc)).toBe("اشري الحليب");
    expect(encrypt("x")).not.toBe(encrypt("x")); // fresh IV every time
  });
  it("rejects tampering", () => {
    const enc = Buffer.from(encrypt("hello"), "base64");
    enc[enc.length - 1] ^= 1;
    expect(() => decrypt(enc.toString("base64"))).toThrow();
  });
});

describe("subscription validation", () => {
  it("accepts real push services and refuses everything else (no SSRF)", () => {
    const ok = (endpoint: string) =>
      SyncBody.safeParse({
        subscription: { endpoint, keys: { p256dh: "p", auth: "a" } },
        reminders: [],
      }).success;
    expect(ok("https://fcm.googleapis.com/fcm/send/xyz")).toBe(true);
    expect(ok("https://web.push.apple.com/abc")).toBe(true);
    expect(ok("http://fcm.googleapis.com/x")).toBe(false);
    expect(ok("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(ok("https://evil.example.com/fcm.googleapis.com")).toBe(false);
    expect(ok("https://fcm.googleapis.com.evil.com/x")).toBe(false);
  });
});

describe("server reminder store", () => {
  it("stores only encrypted data", async () => {
    const { store, kv } = memoryStore();
    await syncReminders(
      store,
      "sid-1",
      body([{ taskId: "t1", fireAt: at(5), title: "اشري الحليب" }]),
      now,
    );
    const all = [...kv.values()].join("|");
    expect(all).not.toContain("الحليب");
    expect(all).not.toContain("mozilla");
  });

  it("replace removes reminders that are no longer wanted, upsert keeps them", async () => {
    const { store } = memoryStore();
    await syncReminders(
      store,
      "s",
      body([
        { taskId: "a", fireAt: at(5), title: "a" },
        { taskId: "b", fireAt: at(6), title: "b" },
      ]),
      now,
    );
    await syncReminders(
      store,
      "s",
      body([{ taskId: "c", fireAt: at(7), title: "c" }], "upsert"),
      now,
    );
    expect((await store.listTaskIds("s")).sort()).toEqual(["a", "b", "c"]);
    await syncReminders(store, "s", body([{ taskId: "c", fireAt: at(7), title: "c" }]), now);
    expect(await store.listTaskIds("s")).toEqual(["c"]);
  });

  it("truncates long titles", async () => {
    const { store } = memoryStore();
    await syncReminders(
      store,
      "s",
      body([{ taskId: "a", fireAt: at(5), title: "x".repeat(300) }]),
      now,
    );
    const sent: string[] = [];
    await fireDue(
      store,
      async (_s, p) => void sent.push(p.title),
      new Date(now.getTime() + 10 * 60_000),
    );
    expect(sent[0].length).toBeLessThanOrEqual(80);
  });
});

describe("turning notifications off", () => {
  it("forget deletes the subscription and every scheduled reminder", async () => {
    const { store, kv } = memoryStore();
    await syncReminders(store, "s", body([{ taskId: "a", fireAt: at(5), title: "a" }]), now);
    await syncReminders(store, "s", { ...body([]), forget: true }, now);
    expect([...kv.keys()]).toEqual([]);
  });
});

describe("firing", () => {
  it("sends due reminders once and deletes them", async () => {
    const { store, kv } = memoryStore();
    await syncReminders(
      store,
      "s",
      body([
        { taskId: "now", fireAt: at(1), title: "soon" },
        { taskId: "later", fireAt: at(60), title: "later" },
      ]),
      now,
    );
    const sent: string[] = [];
    const send = async (_s: Subscription, p: { title: string }) => void sent.push(p.title);
    const t = new Date(now.getTime() + 2 * 60_000);
    expect(await fireDue(store, send, t)).toEqual({ sent: 1, failed: 0, dropped: 0 });
    expect(await fireDue(store, send, t)).toEqual({ sent: 0, failed: 0, dropped: 0 }); // not twice
    expect(sent).toEqual(["soon"]);
    expect([...kv.keys()].filter((k) => k.startsWith("r:"))).toEqual(["r:s:later"]);
  });

  it("deletes the reminder even when sending fails, and forgets dead subscriptions", async () => {
    const { store, kv } = memoryStore();
    await syncReminders(store, "s", body([{ taskId: "a", fireAt: at(1), title: "a" }]), now);
    const gone = async () => {
      throw Object.assign(new Error("gone"), { statusCode: 410 });
    };
    expect(await fireDue(store, gone, new Date(now.getTime() + 120_000))).toMatchObject({
      failed: 1,
    });
    expect([...kv.keys()]).toEqual([]);
  });
});
