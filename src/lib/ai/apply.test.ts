import { describe, expect, it } from "vitest";
import { toTasks } from "./apply";
import type { ParseResult, When } from "./schema";

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
  confidence: 0.9,
  ...p,
});
const task = (title: string, reminderId: string | null) => ({
  title,
  notes: null,
  priority: null,
  list: null,
  reminderId,
  recurrence: null,
  subtasks: [],
  uncertain: [],
});

describe("toTasks", () => {
  it("two tasks sharing one resolved reminder get the same time", () => {
    const r: ParseResult = {
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
    const r: ParseResult = {
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
    const r: ParseResult = {
      tasks: [task("a", "r1")],
      reminders: [{ id: "r1", when: when({ kind: "vague", vagueWord: "شوية", confidence: 0.3 }) }],
    };
    const [a] = toTasks(r, now, [], { vagueMinutes: { شوية: 20 } });
    expect(a.dueAt).toBe(new Date(2026, 9, 8, 10, 20).toISOString());
    expect(a.uncertain).toContain("time");
  });

  it("gives tasks that share a reminder one group, so they are asked about once", () => {
    const r: ParseResult = {
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
    const r: ParseResult = {
      tasks: [task("a", "r1")],
      reminders: [{ id: "r1", when: when({ kind: "anchor", anchor: "leave_work" }) }],
    };
    const [a] = toTasks(r, now, [], { anchorTimes: { leave_work: "17:00" } });
    expect(a.dueAt).toBe(new Date(2026, 9, 8, 17, 0).toISOString());
    expect(a.assumed).toEqual({ key: "anchor.leave_work", value: "17:00" });
    expect(a.needs).toBeNull();
  });
});
