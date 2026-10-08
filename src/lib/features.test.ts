import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import { toTasks } from "./ai/apply";
import { applyEdits, editCandidates, toOpenTasks } from "./ai/edits";
import type { ParsedTask, When } from "./ai/schema";
import { DB_NAME, resetDBForTests } from "./db";
import { applyHeard, corrections, heardFixes } from "./memory/heard";
import { loadTemplates, observeCreated, observeHeard } from "./memory/learning";
import { listFacts } from "./memory/profile";
import { anchorAliases, isRamadanDay } from "./prayer/ramadan";
import { nextPrayerMoment } from "./prayer/times";
import {
  anchorsWaiting,
  anchorWords,
  digestAt,
  digestCounts,
  dueNow,
  snoozed,
  upcomingReminders,
} from "./reminders/engine";
import { Task } from "./schemas";
import { mergeIntoOpenLists, openListHint } from "./tasks/items";
import { completeTask, nextDue } from "./tasks/recur";
import { resolveWhen } from "./time/resolve";

const now = new Date(2026, 9, 8, 10, 0); // Thursday
const at = (min: number) => new Date(now.getTime() + min * 60_000).toISOString();
const mk = (id: string, extra: Partial<Task> = {}) =>
  Task.parse({
    id,
    title: id,
    order: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...extra,
  });
const when = (p: Partial<When>): When => ({
  kind: "absolute",
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
const parsed = (title: string, extra: Partial<ParsedTask> = {}): ParsedTask => ({
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
const item = (name: string, done = false) => ({ id: name, name, qty: null, unit: null, done });

describe("repeating tasks", () => {
  const daily = { freq: "daily" as const, interval: 1 };
  it("a daily task moves to the same clock time on the next day ahead", () => {
    const due = new Date(2026, 9, 8, 8, 0).toISOString();
    expect(nextDue({ dueAt: due, recurrence: daily }, now)).toEqual(new Date(2026, 9, 9, 8, 0));
    // Finished days late: it does not come back in the past.
    const late = new Date(2026, 9, 12, 9, 0);
    expect(nextDue({ dueAt: due, recurrence: daily }, late)).toEqual(new Date(2026, 9, 13, 8, 0));
  });
  it("weekly on chosen days picks the next of them", () => {
    const due = new Date(2026, 9, 8, 18, 0).toISOString(); // Thursday
    const rule = { freq: "weekly" as const, interval: 1, byWeekday: [1, 4] };
    expect(nextDue({ dueAt: due, recurrence: rule }, new Date(2026, 9, 8, 19, 0))).toEqual(
      new Date(2026, 9, 12, 18, 0), // Monday
    );
    expect(
      nextDue({ dueAt: due, recurrence: { freq: "weekly", interval: 2 } }, now)?.getDate(),
    ).toBe(22);
  });
  it("monthly on the 31st lands on the last day of a shorter month", () => {
    const due = new Date(2026, 0, 31, 9, 0).toISOString();
    const rule = { freq: "monthly" as const, interval: 1 };
    expect(nextDue({ dueAt: due, recurrence: rule }, new Date(2026, 1, 1))).toEqual(
      new Date(2026, 1, 28, 9, 0),
    );
  });
  it("finishing one keeps it open, on its next date, with the checklist cleared", () => {
    const task = mk("a", {
      dueAt: at(-60),
      notifiedAt: at(-60),
      recurrence: daily,
      remindBefore: 30,
      items: [item("milk", true)],
    });
    const next = completeTask(task, now);
    expect(next.done).toBe(false);
    expect(next.dueAt).toBe(new Date(2026, 9, 9, 9, 0).toISOString());
    expect(next.reminders).toHaveLength(2);
    expect(next.notifiedAt).toBeNull();
    expect(next.items[0].done).toBe(false);
  });
  it("a task that does not repeat, or has no time, is simply done", () => {
    expect(completeTask(mk("a", { dueAt: at(5) }), now).done).toBe(true);
    expect(completeTask(mk("a", { recurrence: daily }), now).done).toBe(true);
  });
});

describe("earlier reminders", () => {
  it("the parser's lead time becomes a second, earlier reminder", () => {
    const [task] = toTasks(
      {
        tasks: [parsed("doctor", { reminderId: "r" })],
        reminders: [{ id: "r", when: when({ day: "today", time: "15:00", leadMinutes: 60 }) }],
      },
      now,
      [],
    );
    expect(task.remindBefore).toBe(60);
    expect(task.reminders).toEqual([
      new Date(2026, 9, 8, 14, 0).toISOString(),
      new Date(2026, 9, 8, 15, 0).toISOString(),
    ]);
  });
  it("a lead time that is already behind us is dropped", () => {
    const [task] = toTasks(
      {
        tasks: [parsed("call", { reminderId: "r" })],
        reminders: [
          { id: "r", when: when({ kind: "relative", offsetMinutes: 20, leadMinutes: 60 }) },
        ],
      },
      now,
      [],
    );
    expect(task.remindBefore).toBeNull();
  });
  it("fires early, then again at the time, and never twice for the same one", () => {
    const task = mk("a", { dueAt: at(30), remindBefore: 60 });
    expect(dueNow([task], now)).toHaveLength(1);
    const shown = { ...task, notifiedAt: now.toISOString() };
    expect(dueNow([shown], new Date(now.getTime() + 10 * 60_000))).toHaveLength(0);
    expect(dueNow([shown], new Date(now.getTime() + 31 * 60_000))).toHaveLength(1);
  });
  it("the server gets both, the early one once and with the time in its title", () => {
    const task = mk("a", { dueAt: new Date(2026, 9, 8, 15, 0).toISOString(), remindBefore: 60 });
    expect(upcomingReminders([task], now)).toEqual([
      {
        taskId: "a~early",
        fireAt: new Date(2026, 9, 8, 14, 0).toISOString(),
        title: "a (15:00)",
        once: true,
      },
      { taskId: "a", fireAt: task.dueAt, title: "a" },
    ]);
  });
  it("snoozing the early reminder leaves the appointment where it is", () => {
    const task = mk("a", { dueAt: at(60), remindBefore: 60 });
    const s = snoozed(task, 10, now);
    expect(s.dueAt).toBe(task.dueAt);
    expect(s.remindBefore).toBe(50);
    expect(dueNow([s], new Date(now.getTime() + 11 * 60_000))).toHaveLength(1);
    // Nearer than the snooze: only the time itself is left.
    expect(snoozed(mk("b", { dueAt: at(5), remindBefore: 60 }), 10, now).remindBefore).toBeNull();
  });
});

describe("triggers for events the app has no name for", () => {
  it("offers a button with the person's words, and none for the clock's events", () => {
    const tasks = [
      mk("a", { anchor: "sami_arrives", anchorLabel: "tji Sami" }),
      mk("b", { anchor: "after_prayer_asr" }),
      mk("c", { anchor: "iftar" }),
    ];
    expect(anchorsWaiting(tasks, now)).toEqual(["sami_arrives"]);
    expect(anchorWords(tasks, "sami_arrives")).toBe("tji Sami");
    expect(anchorWords(tasks, "match_ends")).toBe("match ends");
  });
});

describe("prayers and Ramadan", () => {
  it("before a prayer is 15 minutes ahead, or the distance that was said", () => {
    const base = nextPrayerMoment("tunis", "prayer_maghrib", now)!;
    const before = nextPrayerMoment("tunis", "before_prayer_maghrib", now)!;
    expect(base.getTime() - before.getTime()).toBe(15 * 60_000);
    const said = nextPrayerMoment("tunis", "before_prayer_maghrib", now, 30)!;
    expect(base.getTime() - said.getTime()).toBe(30 * 60_000);
  });
  it("knows a day in Ramadan from one outside it", () => {
    expect(isRamadanDay(new Date(2026, 2, 1))).toBe(true); // Ramadan 1447
    expect(isRamadanDay(new Date(2026, 9, 8))).toBe(false);
  });
  it("in Ramadan 'after breakfast' resolves after Maghrib; outside it does not", () => {
    const prayerMoment = (a: string, n: Date, m?: number | null) =>
      nextPrayerMoment("tunis", a, n, m);
    const w = when({ kind: "anchor", anchor: "after_breakfast" });
    const on = resolveWhen(w, now, { prayerMoment, anchorAliases: anchorAliases("on", now) });
    expect(on).toMatchObject({ status: "resolved", via: "prayer.after_prayer_maghrib" });
    const off = resolveWhen(w, now, { prayerMoment, anchorAliases: anchorAliases("off", now) });
    expect(off.status).toBe("needs_time");
    // Iftar means Maghrib all year round.
    const iftar = resolveWhen(when({ kind: "anchor", anchor: "iftar" }), now, {
      prayerMoment,
      anchorAliases: anchorAliases("off", now),
    });
    expect(iftar).toMatchObject({ status: "resolved", via: "prayer.prayer_maghrib" });
  });
});

describe("learning from fixed transcripts", () => {
  it("finds a word swapped for a similar one, and nothing else", () => {
    expect(corrections("نشري الخبر من الحانوت", "نشري الخبز من الحانوت")).toEqual([
      ["الخبر", "الخبز"],
    ]);
    // A change of mind, added words and removed words teach nothing.
    expect(corrections("buy bread tomorrow", "buy milk tomorrow")).toEqual([]);
    expect(corrections("buy bread", "buy fresh bread today")).toEqual([]);
    expect(corrections("call the the doctor", "call the doctor")).toEqual([]);
  });
  it("applies trusted fixes to whole words only, keeping punctuation", () => {
    const fixes = { الخبر: "الخبز" };
    expect(applyHeard("نشري الخبر، وبعد الخبرة", fixes)).toBe("نشري الخبز، وبعد الخبرة");
  });
});

describe("changes to tasks the person already has", () => {
  const medicine = mk("m", { title: "نجيب الدوا", dueAt: at(60) });
  const shop = mk("s", {
    title: "Courses",
    list: "shopping",
    items: [item("bread"), item("milk")],
  });
  const other = mk("o", { title: "Call the bank" });

  it("only tasks that share a word with the sentence are candidates", () => {
    const c = editCandidates("خلّي الدوا لغدوة", [medicine, shop, other]);
    expect([...c.values()].map((t) => t.id)).toEqual(["m"]);
    expect(toOpenTasks(c)).toEqual([{ ref: "t1", title: "نجيب الدوا" }]);
    expect(editCandidates("I got the bread", [medicine, shop, other]).get("t1")?.id).toBe("s");
    expect(toOpenTasks(editCandidates("nothing in common", [medicine]))).toBeUndefined();
    // A word as common as "the" does not make a task a candidate.
    expect(editCandidates("I finished the report", [other]).size).toBe(0);
  });
  it("reschedules, completes and checks an item; skips what it cannot place", () => {
    const candidates = new Map([
      ["t1", medicine],
      ["t2", shop],
    ]);
    const changed = applyEdits(
      {
        reminders: [{ id: "r", when: when({ day: "tomorrow", time: "09:00" }) }],
        edits: [
          { ref: "t1", action: "reschedule", reminderId: "r", item: null },
          { ref: "t2", action: "check_item", reminderId: null, item: "Bread" },
          { ref: "t9", action: "complete", reminderId: null, item: null },
          { ref: "t2", action: "check_item", reminderId: null, item: "eggs" },
        ],
      },
      candidates,
      now,
    );
    expect(changed).toHaveLength(2);
    expect(changed[0].dueAt).toBe(new Date(2026, 9, 9, 9, 0).toISOString());
    expect(changed[0].timeBy).toBe("said");
    expect(changed[1].items.map((i) => i.done)).toEqual([true, false]);
    const done = applyEdits(
      { reminders: [], edits: [{ ref: "t1", action: "complete", reminderId: null, item: null }] },
      candidates,
      now,
    );
    expect(done[0].done).toBe(true);
  });
  it("an answer with no edits field changes nothing", () => {
    expect(applyEdits({ reminders: [] }, new Map([["t1", medicine]]), now)).toEqual([]);
  });
});

describe("things named for an open list", () => {
  const list = mk("s", { list: "shopping", items: [item("bread", true), item("milk")] });
  it("join that list instead of becoming a second task", () => {
    const extra = mk("n", {
      list: "shopping",
      items: [
        { ...item("Bread"), qty: 2 },
        { ...item("eggs"), qty: 6 },
      ],
    });
    const { grown, fresh } = mergeIntoOpenLists([extra], [list]);
    expect(fresh).toEqual([]);
    expect(grown[0].items.map((i) => [i.name, i.qty, i.done])).toEqual([
      ["bread", 2, false], // back on the list, not listed twice
      ["milk", null, false],
      ["eggs", 6, false],
    ]);
  });
  it("a task with its own time, another category or no items stays a new task", () => {
    const timed = mk("a", { list: "shopping", items: [item("eggs")], dueAt: at(60) });
    const elsewhere = mk("b", { list: "work", items: [item("badge")] });
    const plain = mk("c", { list: "shopping" });
    const { grown, fresh } = mergeIntoOpenLists([timed, elsewhere, plain], [list]);
    expect(grown).toEqual([]);
    expect(fresh).toHaveLength(3);
  });
  it("tells the parser a list is open by its category only", () => {
    expect(openListHint([list])).toContain('"shopping"');
    expect(openListHint([list])).not.toContain("milk");
    expect(openListHint([mk("x")])).toBeNull();
  });
});

describe("evening summary", () => {
  it("counts tomorrow's tasks and those without a time", () => {
    const tasks = [
      mk("a", { dueAt: new Date(2026, 9, 9, 9, 0).toISOString() }),
      mk("b", { dueAt: new Date(2026, 9, 10, 9, 0).toISOString() }),
      mk("c"),
      mk("d", { done: true }),
    ];
    expect(digestCounts(tasks, now)).toEqual({ tomorrow: 1, needsTime: 1 });
    expect(digestCounts([mk("d", { dueAt: at(5) })], now)).toBeNull();
  });
  it("is at 21:00 today, and not once that has passed", () => {
    expect(digestAt(now)).toEqual(new Date(2026, 9, 8, 21, 0));
    expect(digestAt(new Date(2026, 9, 8, 21, 30))).toBeNull();
  });
});

describe("learning that needs the database", () => {
  beforeEach(async () => {
    await resetDBForTests();
    await deleteDB(DB_NAME);
  });
  it("a fix is trusted only after it has been made three times", async () => {
    for (let i = 0; i < 2; i++) await observeHeard("نشري الخبر", "نشري الخبز");
    expect(heardFixes(await listFacts())).toEqual({});
    await observeHeard("نشري الخبر", "نشري الخبز");
    expect(heardFixes(await listFacts())).toEqual({ الخبر: "الخبز" });
  });
  it("a task added three times is kept as it last looked, for adding again", async () => {
    const shop = (items: string[]) =>
      mk(crypto.randomUUID(), {
        title: "Courses",
        list: "shopping",
        items: items.map((n) => item(n)),
      });
    await observeCreated([shop(["bread"])]);
    await observeCreated([shop(["bread"])]);
    expect(await loadTemplates()).toEqual({});
    await observeCreated([shop(["bread", "milk"])]);
    expect((await loadTemplates()).courses).toEqual({
      title: "Courses",
      list: "shopping",
      items: [
        { name: "bread", qty: null, unit: null },
        { name: "milk", qty: null, unit: null },
      ],
    });
  });
});
