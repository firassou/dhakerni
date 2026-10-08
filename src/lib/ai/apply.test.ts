import { describe, expect, it } from "vitest";
import { toTasks } from "./apply";
import type { ParsedTask, ParsedTasks, When } from "./schema";

const now = new Date(2026, 9, 8, 10, 0);
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
const task = (title: string, reminderId: string | null): ParsedTask => ({
  title,
  description: null,
  items: [],
  suggestedSteps: [],
  decision: null,
  priority: null,
  list: null,
  reminderId,
  recurrence: null,
  subtasks: [],
  uncertain: [],
});

describe("toTasks", () => {
  it("two tasks sharing one resolved reminder get the same time", () => {
    const r: ParsedTasks = {
      tasks: [task("x", "r1"), task("y", "r1")],
      reminders: [{ id: "r1", when: when({ kind: "relative", offsetMinutes: 10 }) }],
    };
    const [a, b] = toTasks(r, now, []);
    expect(a.dueAt).toBe(new Date(2026, 9, 8, 10, 10).toISOString());
    expect(b.dueAt).toBe(a.dueAt);
    expect(a.needs).toBeNull();
    expect(a.order).toBeLessThan(b.order); // first task stays on top
  });

  it("creates vague and anchor tasks in the Needs time state with the reason", () => {
    const r: ParsedTasks = {
      tasks: [task("a", "r1"), task("b", "r2"), task("c", null)],
      reminders: [
        { id: "r1", when: when({ kind: "vague", vagueWord: "بعد شوية" }) },
        { id: "r2", when: when({ kind: "anchor", anchor: "leave_work" }) },
      ],
    };
    const [a, b, c] = toTasks(r, now, []);
    expect([a.dueAt, b.dueAt, c.dueAt]).toEqual([null, null, null]);
    expect(a.needs).toMatchObject({ reason: "vague", word: "شوية", dismissed: false });
    expect(b.needs).toMatchObject({ reason: "anchor", word: "leave_work", dismissed: false });
    expect(c.needs).toMatchObject({ reason: "none", word: null, dismissed: true }); // nothing to ask
  });

  it("applies learned vague meanings and flags low confidence", () => {
    const r: ParsedTasks = {
      tasks: [task("a", "r1")],
      reminders: [{ id: "r1", when: when({ kind: "vague", vagueWord: "شوية", confidence: 0.3 }) }],
    };
    const [a] = toTasks(r, now, [], { vagueMinutes: { شوية: 20 } });
    expect(a.dueAt).toBe(new Date(2026, 9, 8, 10, 20).toISOString());
    expect(a.uncertain).toContain("time");
  });

  it("gives tasks that share a reminder one group, so they are asked about once", () => {
    const r: ParsedTasks = {
      tasks: [task("a", "r1"), task("b", "r1"), task("c", "r2")],
      reminders: [
        { id: "r1", when: when({ kind: "vague", vagueWord: "شوية" }) },
        { id: "r2", when: when({ kind: "vague", vagueWord: "بعدين" }) },
      ],
    };
    const [a, b, c] = toTasks(r, now, []);
    expect(a.needs?.group).toBeTruthy();
    expect(b.needs?.group).toBe(a.needs?.group);
    expect(c.needs?.group).not.toBe(a.needs?.group);
  });

  it("records what a learned value decided, for the editable chip", () => {
    const r: ParsedTasks = {
      tasks: [task("a", "r1")],
      reminders: [{ id: "r1", when: when({ kind: "anchor", anchor: "leave_work" }) }],
    };
    const [a] = toTasks(r, now, [], { anchorTimes: { leave_work: "17:00" } });
    expect(a.dueAt).toBe(new Date(2026, 9, 8, 17, 0).toISOString());
    expect(a.assumed).toEqual({ key: "anchor.leave_work", value: "17:00" });
    expect(a.needs).toBeNull();
  });
});

describe("smarter tasks", () => {
  const withReminder = (t: ParsedTask): ParsedTasks => ({ tasks: [t], reminders: [] });

  it("keeps the title short and puts the full idea in the description", () => {
    const [a] = toTasks(
      withReminder({ ...task("nbadel 7wayji", null), description: "nbadel 7wayji 9bal ma tji x" }),
      now,
      [],
    );
    expect(a.title).toBe("nbadel 7wayji");
    expect(a.notes).toBe("nbadel 7wayji 9bal ma tji x");
  });

  it("turns 'two juice' into a quantity, not part of the title", () => {
    const [a] = toTasks(
      withReminder({ ...task("Buy juice", null), items: [{ name: "juice", qty: 2, unit: null }] }),
      now,
      [],
    );
    expect(a.title).toBe("Buy juice");
    expect(a.items).toMatchObject([{ name: "juice", qty: 2, unit: null, done: false }]);
    expect(a.items[0].id).toBeTruthy();
  });

  it("drops empty items and keeps units", () => {
    const [a] = toTasks(
      withReminder({
        ...task("اشري", null),
        items: [
          { name: "  ", qty: 1, unit: null },
          { name: "حليب", qty: 2, unit: " ليتر " },
        ],
      }),
      now,
      [],
    );
    expect(a.items).toHaveLength(1);
    expect(a.items[0]).toMatchObject({ name: "حليب", qty: 2, unit: "ليتر" });
  });

  it("keeps suggestions separate from real steps, capped at 4", () => {
    const [a] = toTasks(
      withReminder({
        ...task("Travel to Sfax", null),
        subtasks: ["Pack"],
        suggestedSteps: ["Book transport", "Book hotel", "Check weather", "Tell family", "Extra"],
      }),
      now,
      [],
    );
    expect(a.subtasks.map((x) => x.title)).toEqual(["Pack"]);
    expect(a.suggestions).toEqual(["Book transport", "Book hotel", "Check weather", "Tell family"]);
  });

  it("carries a decision with its suggestion, nothing chosen yet", () => {
    const [a] = toTasks(
      withReminder({
        ...task("Decide: new phone or repair", null),
        decision: {
          options: ["New phone", "Repair"],
          recommendation: "Repair",
          reason: "It is only a screen.",
        },
      }),
      now,
      [],
    );
    expect(a.decision).toEqual({
      options: ["New phone", "Repair"],
      recommendation: "Repair",
      reason: "It is only a screen.",
      chosen: null,
    });
  });

  it("ignores a decision with fewer than two options", () => {
    const [a] = toTasks(
      withReminder({
        ...task("x", null),
        decision: { options: ["only one"], recommendation: null, reason: null } as never,
      }),
      now,
      [],
    );
    expect(a.decision).toBeNull();
  });

  it("still accepts an older-style response without the new fields", () => {
    const old = {
      tasks: [
        {
          title: "x",
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
    } as unknown as ParsedTasks;
    const [a] = toTasks(old, now, []);
    expect(a).toMatchObject({ title: "x", notes: "", items: [], suggestions: [], decision: null });
  });
});
