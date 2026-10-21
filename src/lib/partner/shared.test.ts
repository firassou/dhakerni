import { describe, expect, it } from "vitest";
import { Task } from "../schemas";
import { newTask } from "../tasks/ops";
import { applyStatus, fromShared, SharedTask, toShared } from "./shared";

const now = new Date("2026-10-21T10:00:00Z");
const base = (extra: Partial<Task> = {}) => newTask("Buy bread", [], now, extra);

describe("toShared", () => {
  it("keeps the content and drops everything about the sender's device", () => {
    const task = base({
      notes: "the long one",
      dueAt: "2026-10-22T08:00:00.000Z",
      priority: "high",
      list: "shopping",
      items: [{ id: "i1", name: "bread", qty: 2, unit: null, done: true }],
      subtasks: [{ id: "s1", title: "ask the baker", done: true }],
      assumed: { key: "usual.time.shopping", value: "08:00" },
      remindBefore: 30,
    });
    const shared = toShared(task);
    expect(shared).toEqual({
      title: "Buy bread",
      notes: "the long one",
      dueAt: "2026-10-22T08:00:00.000Z",
      priority: "high",
      list: "shopping",
      items: [{ name: "bread", qty: 2, unit: null }],
      subtasks: ["ask the baker"],
      recurrence: null,
    });
    const json = JSON.stringify(shared);
    for (const leak of [task.id, "assumed", "remindBefore", "notifiedAt", "reminders"])
      expect(json).not.toContain(leak);
  });

  it("sends a bill as a plain task: no amount, no reference", () => {
    const bill = {
      provider: "STEG",
      amountMillimes: 45_300,
      reference: "1234567",
      periodFrom: null,
      periodTo: null,
      paidAt: null,
    };
    const shared = toShared(base({ title: "Pay STEG", list: "bills", bill }));
    expect(shared.list).toBe("inbox");
    expect(JSON.stringify(shared)).not.toMatch(/45300|1234567|amountMillimes/);
  });

  it("cuts what is too long instead of failing to send", () => {
    const shared = toShared(base({ title: "t".repeat(300), notes: "n".repeat(5000) }));
    expect(shared.title).toHaveLength(200);
    expect(shared.notes).toHaveLength(2000);
  });
});

describe("fromShared", () => {
  it("lands as a complete task from the partner, on top of the list, with a fresh checklist", () => {
    const shared = SharedTask.parse({
      title: "Buy bread",
      dueAt: "2026-10-22T08:00:00.000Z",
      items: [{ name: "bread", qty: 2 }],
      subtasks: ["ask the baker"],
    });
    const mine = base({ order: 5 });
    const task = fromShared(shared, "inbox-1", [mine], now);
    expect(Task.safeParse(task).success).toBe(true);
    expect(task).toMatchObject({
      id: "inbox-1",
      origin: "partner",
      assignedTo: null,
      done: false,
      reminders: ["2026-10-22T08:00:00.000Z"],
      needs: null,
    });
    expect(task.order).toBeLessThan(Math.min(mine.order, 0));
    expect(task.items[0]).toMatchObject({ name: "bread", qty: 2, done: false });
    expect(task.items[0].id).toBeTruthy();
    expect(task.subtasks[0]).toMatchObject({ title: "ask the baker", done: false });
  });

  it("a task with no time asks nothing", () => {
    const task = fromShared(SharedTask.parse({ title: "Call mum" }), "x", [], now);
    expect(task.dueAt).toBeNull();
    expect(task.needs).toMatchObject({ reason: "none", dismissed: true });
  });
});

describe("SharedTask", () => {
  it("rejects an empty title and unknown shapes", () => {
    expect(SharedTask.safeParse({ title: "" }).success).toBe(false);
    expect(SharedTask.safeParse({ title: "x", items: [{ name: "" }] }).success).toBe(false);
    expect(SharedTask.safeParse(null).success).toBe(false);
  });
});

describe("applyStatus", () => {
  const shared = fromShared(SharedTask.parse({ title: "Buy bread" }), "s1", [], now);
  const later = new Date("2026-10-21T12:00:00Z");

  it("finishes the task and records it in the link, so it is not sent back", () => {
    const done = applyStatus(shared, true, later)!;
    expect(done).toMatchObject({ done: true, doneAt: later.toISOString(), share: { done: true } });
  });

  it("reopens it", () => {
    const reopened = applyStatus(applyStatus(shared, true, later)!, false, later)!;
    expect(reopened).toMatchObject({ done: false, doneAt: null, share: { done: false } });
  });

  it("does nothing when both already agree, or the task is not shared", () => {
    expect(applyStatus(shared, false, later)).toBeNull();
    expect(applyStatus(newTask("Mine", [], now), true, later)).toBeNull();
  });

  it("a task done here but not yet told is still brought in step", () => {
    const told = applyStatus({ ...shared, done: true }, true, later)!;
    expect(told.share).toEqual({ id: "s1", done: true });
  });
});
