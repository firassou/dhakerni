import { describe, expect, it } from "vitest";
import { Task } from "../schemas";
import { selectTasks } from "./filters";
import { newTask, reorderVisible, toggleDone } from "./ops";
import { fromLocalInput, toLocalInput } from "../time/format";

const now = new Date(2026, 9, 8, 12, 0); // 8 Oct 2026, noon local
const mk = (id: string, order: number, extra: Partial<Task> = {}) =>
  Task.parse({
    id,
    title: id,
    order,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...extra,
  });
const at = (d: number, h = 9) => new Date(2026, 9, d, h, 0).toISOString();
const ids = (ts: Task[]) => ts.map((t) => t.id);

describe("filters", () => {
  const tasks = [
    mk("overdue", 1, { dueAt: at(8, 8) }),
    mk("later-today", 2, { dueAt: at(8, 20) }),
    mk("tomorrow", 3, { dueAt: at(9) }),
    mk("no-time", 4),
    mk("finished", 5, { done: true, doneAt: at(7), dueAt: at(8) }),
  ];
  it("today includes overdue, excludes done", () => {
    expect(ids(selectTasks(tasks, "today", now))).toEqual(["overdue", "later-today"]);
  });
  it("upcoming starts tomorrow", () => {
    expect(ids(selectTasks(tasks, "upcoming", now))).toEqual(["tomorrow"]);
  });
  it("needsTime lists tasks without a due time", () => {
    expect(ids(selectTasks(tasks, "needsTime", now))).toEqual(["no-time"]);
  });
  it("all hides done, done shows only done", () => {
    expect(ids(selectTasks(tasks, "all", now))).toHaveLength(4);
    expect(ids(selectTasks(tasks, "done", now))).toEqual(["finished"]);
  });
});

describe("ops", () => {
  it("puts new tasks on top and starts without a time", () => {
    const t = newTask("  buy bread ", [mk("a", 3), mk("b", -2)], now);
    expect(t.title).toBe("buy bread");
    expect(t.order).toBe(-3);
    expect(t.dueAt).toBeNull();
  });
  it("toggleDone sets and clears doneAt", () => {
    const done = toggleDone(mk("a", 1), now);
    expect(done.done).toBe(true);
    expect(done.doneAt).not.toBeNull();
    expect(toggleDone(done, now).doneAt).toBeNull();
  });
  it("reorder keeps hidden tasks in place", () => {
    // visible tasks occupy slots 1, 5, 9; hidden ones sit between them
    const v = [mk("a", 1), mk("b", 5), mk("c", 9)];
    const changed = reorderVisible(v, 2, 0); // move c to the top
    const byId = Object.fromEntries(changed.map((t) => [t.id, t.order]));
    expect(byId).toEqual({ c: 1, a: 5, b: 9 });
  });
  it("reorder to same spot changes nothing", () => {
    expect(reorderVisible([mk("a", 1), mk("b", 2)], 1, 1)).toEqual([]);
  });
});

describe("datetime-local conversion", () => {
  it("round-trips at minute precision", () => {
    const iso = at(8, 17);
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(fromLocalInput("")).toBeNull();
  });
});
