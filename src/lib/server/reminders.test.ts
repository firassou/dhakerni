import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";
import {
  arm,
  armUpcoming,
  fireDue,
  health,
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
  const marks = new Set<string>();
  let beatAt: number | null = null;
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
    async dueTimes(from, to, limit) {
      return [...due.values()]
        .filter((at) => at >= from && at <= to)
        .sort((a, b) => a - b)
        .slice(0, limit);
    },
    async markOnce(key) {
      if (marks.has(key)) return false;
      marks.add(key);
      return true;
    },
    async unmark(key) {
      marks.delete(key);
    },
    async beat(nowMs) {
      beatAt = nowMs;
    },
    async lastBeat() {
      return beatAt;
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
  cancel: [],
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
  it("sends a due reminder, repeats it twice a few minutes apart, then deletes it", async () => {
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
    const later = (min: number) => new Date(t.getTime() + min * 60_000);
    expect((await fireDue(store, send, later(3))).sent).toBe(1);
    expect((await fireDue(store, send, later(6))).sent).toBe(1);
    expect((await fireDue(store, send, later(9))).sent).toBe(0); // three in all, then it stops
    expect(sent).toEqual(["soon", "soon", "soon"]);
    expect([...kv.keys()].filter((k) => k.startsWith("r:"))).toEqual(["r:s:later"]);
  });

  it("stops repeating once the person answers", async () => {
    const one = [{ taskId: "a", fireAt: at(1), title: "a" }];
    const after = (min: number) => new Date(now.getTime() + min * 60_000);
    let sent = 0;
    const send = async () => void sent++;

    // Done on the notification
    let { store, kv } = memoryStore();
    await syncReminders(store, "s", body(one), now);
    await fireDue(store, send, after(2));
    await syncReminders(store, "s", { ...body([]), mode: "upsert", cancel: ["a"] }, after(2));
    await fireDue(store, send, after(10));
    expect(sent).toBe(1);
    expect([...kv.keys()].filter((k) => k.startsWith("r:"))).toEqual([]);

    // Snooze: the same task comes back with a new time, and starts over from there
    ({ store, kv } = memoryStore());
    await syncReminders(store, "s", body(one), now);
    await fireDue(store, send, after(2));
    await syncReminders(
      store,
      "s",
      body([{ taskId: "a", fireAt: at(30), title: "a" }], "upsert"),
      after(2),
    );
    await fireDue(store, send, after(10));
    expect(sent).toBe(2); // nothing until the new time
    await fireDue(store, send, after(31));
    expect(sent).toBe(3);
  });

  it("a sync from the app never removes a reminder that is due or repeating", async () => {
    // The app lists only future reminders, so a due one is missing from its list. That used to delete
    // it: with the app alive in the background, the reminder was gone before the server could send it.
    const { store } = memoryStore();
    const sent: string[] = [];
    const send = async (_s: Subscription, p: { title: string }) => void sent.push(p.title);
    const after = (min: number) => new Date(now.getTime() + min * 60_000);
    await syncReminders(store, "s", body([{ taskId: "a", fireAt: at(1), title: "a" }]), now);

    await syncReminders(store, "s", body([]), after(1.5)); // due, not sent yet
    await fireDue(store, send, after(2));
    expect(sent).toEqual(["a"]);

    await syncReminders(store, "s", body([]), after(3)); // between repeats
    await fireDue(store, send, after(5));
    await fireDue(store, send, after(8));
    expect(sent).toEqual(["a", "a", "a"]);
    expect(await store.listTaskIds("s")).toEqual([]); // and then it is gone by itself
  });

  it("a reminder not yet due is still removed when the app no longer lists it", async () => {
    const { store } = memoryStore();
    await syncReminders(store, "s", body([{ taskId: "a", fireAt: at(30), title: "a" }]), now);
    await syncReminders(store, "s", body([]), now);
    expect(await store.listTaskIds("s")).toEqual([]);
  });

  it("re-sending a due reminder does not start its repeats over", async () => {
    const { store } = memoryStore();
    let sent = 0;
    const send = async () => void sent++;
    const after = (min: number) => new Date(now.getTime() + min * 60_000);
    const one = [{ taskId: "a", fireAt: at(1), title: "a" }];
    await syncReminders(store, "s", body(one), now);
    for (const min of [2, 5, 8, 11, 14]) {
      await fireDue(store, send, after(min));
      await syncReminders(store, "s", body(one), after(min)); // a client with a slow clock
    }
    expect(sent).toBe(3);
  });

  it("a test reminder is sent once", async () => {
    const { store } = memoryStore();
    let sent = 0;
    const send = async () => void sent++;
    const after = (min: number) => new Date(now.getTime() + min * 60_000);
    await syncReminders(
      store,
      "s",
      body([{ taskId: "test-1", fireAt: at(1), title: "t", once: true }], "upsert"),
      now,
    );
    await fireDue(store, send, after(2));
    await fireDue(store, send, after(10));
    expect(sent).toBe(1);
  });

  it("a send that fails for a passing reason is tried again, not lost", async () => {
    const { store } = memoryStore();
    await syncReminders(store, "s", body([{ taskId: "a", fireAt: at(1), title: "a" }]), now);
    const after = (min: number) => new Date(now.getTime() + min * 60_000);
    let up = false;
    let sent = 0;
    const send = async () => {
      if (!up) throw Object.assign(new Error("push service busy"), { statusCode: 503 });
      sent++;
    };
    expect(await fireDue(store, send, after(2))).toMatchObject({ sent: 0, failed: 1 });
    expect(await store.listTaskIds("s")).toEqual(["a"]); // still there
    expect((await fireDue(store, send, after(2.5))).failed).toBe(0); // not before a minute has passed
    up = true;
    expect(await fireDue(store, send, after(3.1))).toMatchObject({ sent: 1 });
    expect(sent).toBe(1);
  });

  it("gives up after several failed sends", async () => {
    const { store } = memoryStore();
    await syncReminders(store, "s", body([{ taskId: "a", fireAt: at(1), title: "a" }]), now);
    const down = async () => {
      throw Object.assign(new Error("down"), { statusCode: 500 });
    };
    let failed = 0;
    for (let min = 2; min < 20; min++)
      failed += (await fireDue(store, down, new Date(now.getTime() + min * 60_000))).failed;
    expect(failed).toBe(6); // the first try and five more
    expect(await store.listTaskIds("s")).toEqual([]);
  });
});

describe("waking the server", () => {
  const after = (min: number) => new Date(now.getTime() + min * 60_000);

  it("books one exact call per minute, however many reminders or syncs", async () => {
    const { store } = memoryStore();
    const booked: number[] = [];
    const schedule = async (atMs: number) => void booked.push(atMs);
    const list = [
      { taskId: "a", fireAt: at(5), title: "a" },
      { taskId: "b", fireAt: at(5), title: "b" },
      { taskId: "c", fireAt: at(9), title: "c" },
    ];
    await syncReminders(store, "s", body(list), now, schedule);
    await syncReminders(store, "s", body(list), now, schedule);
    expect(booked).toHaveLength(2);
    expect(booked[0]).toBeGreaterThan(Date.parse(at(5))); // just after, so it is due on arrival
    expect(booked[0] - Date.parse(at(5))).toBeLessThanOrEqual(1000);
  });

  it("books the repeats and the retries too", async () => {
    const { store } = memoryStore();
    const booked: number[] = [];
    const schedule = async (atMs: number) => void booked.push(atMs);
    await syncReminders(
      store,
      "s",
      body([{ taskId: "a", fireAt: at(1), title: "a" }]),
      now,
      schedule,
    );
    await fireDue(store, async () => {}, after(2), schedule);
    expect(booked).toHaveLength(2);
    expect(booked[1]).toBeGreaterThanOrEqual(after(5).getTime());
  });

  it("does not book far ahead at once; the periodic scan books it when it comes near", async () => {
    const { store } = memoryStore();
    const booked: number[] = [];
    const schedule = async (atMs: number) => void booked.push(atMs);
    const far = new Date(now.getTime() + 10 * 86_400_000).toISOString();
    await syncReminders(
      store,
      "s",
      body([{ taskId: "a", fireAt: far, title: "a" }]),
      now,
      schedule,
    );
    expect(booked).toHaveLength(0);
    await armUpcoming(store, schedule, new Date(now.getTime() + 8 * 86_400_000));
    expect(booked).toHaveLength(1);
  });

  it("a booking that fails can be made again", async () => {
    const { store } = memoryStore();
    let ok = false;
    let booked = 0;
    const schedule = async () => {
      if (!ok) throw new Error("qstash 500");
      booked++;
    };
    await arm(store, schedule, Date.parse(at(5)), now);
    ok = true;
    await arm(store, schedule, Date.parse(at(5)), now);
    expect(booked).toBe(1);
  });

  it("health shows how long the oldest due reminder has waited, and when the server last ran", async () => {
    const { store } = memoryStore();
    expect(await health(store, now)).toEqual({ lateMs: 0, lastRunMs: null });
    await syncReminders(store, "s", body([{ taskId: "a", fireAt: at(1), title: "a" }]), now);
    expect((await health(store, after(6))).lateMs).toBe(5 * 60_000); // nothing is sending
    await fireDue(store, async () => {}, after(6));
    const h = await health(store, after(6));
    expect(h.lateMs).toBe(0);
    expect(h.lastRunMs).toBe(after(6).getTime());
  });

  it("forgets a dead subscription, with its reminder", async () => {
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
