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
    expect(a.needs).toEqual({ reason: "vague", word: "شوية" });
    expect(b.needs).toEqual({ reason: "anchor", word: "leave_work" });
    expect(c.needs).toEqual({ reason: "none", word: null });
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
});
