import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import { DB_NAME, getDB, resetDBForTests } from "../db";
import { loadTasks, normalizeTask } from "./repo";

/** A task exactly as v0.2 saved it: none of the fields added later. */
const legacy = {
  id: "old-1",
  title: "نشري الخبز",
  notes: "",
  dueAt: null,
  reminders: [],
  priority: "normal",
  list: "inbox",
  recurrence: null,
  subtasks: [],
  uncertain: [],
  done: false,
  doneAt: null,
  order: 0,
  createdAt: "2026-10-08T09:00:00.000Z",
  updatedAt: "2026-10-08T09:00:00.000Z",
};

describe("tasks saved by older versions", () => {
  beforeEach(async () => {
    await resetDBForTests();
    await deleteDB(DB_NAME);
  });

  it("gain every newer field with a safe default", () => {
    const t = normalizeTask(legacy);
    expect(t).toMatchObject({
      title: "نشري الخبز",
      items: [],
      suggestions: [],
      decision: null,
      needs: null,
      assumed: null,
      anchor: null,
      notifiedAt: null,
      timeBy: null,
    });
  });

  it("are normalized when loaded, and the stored copy is left untouched until the task is next saved", async () => {
    const db = await getDB();
    await db.put("tasks", legacy as never);
    const [t] = await loadTasks();
    expect(t.items).toEqual([]);
    expect(Array.isArray(t.suggestions)).toBe(true);
    expect((await db.get("tasks", "old-1")) as Record<string, unknown>).not.toHaveProperty("items");
  });

  it("a damaged task is kept with safe arrays instead of being dropped", () => {
    const t = normalizeTask({ id: "x", title: "half a task", order: "oops", items: "nope" });
    expect(t.title).toBe("half a task");
    expect(t.items).toEqual([]);
    expect(t.subtasks).toEqual([]);
    expect(t.reminders).toEqual([]);
  });
});
