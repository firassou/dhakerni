import { describe, expect, it } from "vitest";
import { Task } from "../schemas";
import {
  anchorsWaiting,
  dueNow,
  isStale,
  roundedClock,
  snoozed,
  triggerable,
  upcomingReminders,
} from "./engine";

const now = new Date(2026, 9, 8, 10, 0);
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

describe("reminder engine", () => {
  it("fires only due, open, not-yet-shown tasks", () => {
    const tasks = [
      mk("due", { dueAt: at(-1) }),
      mk("future", { dueAt: at(5) }),
      mk("done", { dueAt: at(-1), done: true }),
      mk("shown", { dueAt: at(-1), notifiedAt: at(-1) }),
      mk("none"),
    ];
    expect(dueNow(tasks, now).map((t) => t.id)).toEqual(["due"]);
  });
  it("treats day-old reminders as stale", () => {
    expect(isStale(mk("a", { dueAt: at(-25 * 60) }), now)).toBe(true);
    expect(isStale(mk("a", { dueAt: at(-60) }), now)).toBe(false);
  });
  it("snoozing moves the time and lets it fire again", () => {
    const s = snoozed(mk("a", { dueAt: at(-1), notifiedAt: at(-1) }), 10, now);
    expect(s.dueAt).toBe(at(10));
    expect(s.reminders).toEqual([at(10)]);
    expect(s.notifiedAt).toBeNull();
  });
  it("sends the server only future, open reminders", () => {
    const tasks = [
      mk("a", { dueAt: at(5) }),
      mk("b", { dueAt: at(-5) }),
      mk("c", { dueAt: at(9), done: true }),
      mk("d"),
    ];
    expect(upcomingReminders(tasks, now)).toEqual([{ taskId: "a", fireAt: at(5), title: "a" }]);
  });
  it("triggers fire tasks waiting on an event, including ones already scheduled later", () => {
    const tasks = [
      mk("a", { anchor: "leave_work" }),
      mk("b", { anchor: "leave_work", dueAt: at(300) }),
      mk("c", { anchor: "leave_work", dueAt: at(-1) }),
      mk("d", { anchor: "arrive_home", done: true }),
    ];
    expect(triggerable(tasks, "leave_work", now).map((t) => t.id)).toEqual(["a", "b"]);
    expect(anchorsWaiting(tasks, now)).toEqual(["leave_work"]);
  });
  it("rounds a clock to 15 minutes", () => {
    expect(roundedClock(new Date(2026, 9, 8, 17, 7))).toBe("17:00");
    expect(roundedClock(new Date(2026, 9, 8, 17, 9))).toBe("17:15");
    expect(roundedClock(new Date(2026, 9, 8, 23, 58))).toBe("00:00");
  });
});
