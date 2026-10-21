import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Task } from "../schemas";
import { fromShared, SharedTask } from "./shared";

/**
 * public/sw.js builds the task it saves when a push arrives with the app closed, with its own copy of
 * fromShared (it cannot import app code). This keeps the two from drifting apart.
 */
function swTaskFromShared() {
  const src = readFileSync("public/sw.js", "utf8");
  const start = src.indexOf("function taskFromShared");
  const end = src.indexOf("\n}\n", start) + 3;
  return new Function("newId", `${src.slice(start, end)}; return taskFromShared;`)(() =>
    crypto.randomUUID(),
  ) as (shared: unknown, id: string, order: number) => unknown;
}

const strip = (t: Task) => ({
  ...t,
  createdAt: "-",
  updatedAt: "-",
  items: t.items.map((i) => ({ ...i, id: "-" })),
  subtasks: t.subtasks.map((s) => ({ ...s, id: "-" })),
});

describe("service worker task builder", () => {
  const build = swTaskFromShared();

  for (const [label, input] of [
    [
      "a full task",
      {
        title: "Buy bread",
        notes: "n",
        dueAt: "2026-10-22T08:00:00.000Z",
        priority: "high",
        list: "shopping",
        items: [{ name: "bread", qty: 2, unit: "kg" }],
        subtasks: ["ask"],
        recurrence: { freq: "daily", interval: 1 },
      },
    ],
    ["a bare task", { title: "Call mum" }],
  ] as const) {
    it(`builds the same task as the app does for ${label}`, () => {
      const shared = SharedTask.parse(input);
      const fromApp = fromShared(shared, "id-1", [], new Date());
      const fromSw = build(shared, "id-1", fromApp.order);
      const parsed = Task.safeParse(fromSw);
      expect(parsed.success).toBe(true);
      expect(strip(parsed.data!)).toEqual(strip(fromApp));
    });
  }
});
