import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import { DB_NAME, getDB, getSessionId, resetDBForTests } from "./index";
import { Task } from "../schemas";

beforeEach(async () => {
  await resetDBForTests();
  await deleteDB(DB_NAME);
});

describe("db", () => {
  it("creates one stable anonymous session id", async () => {
    const a = await getSessionId();
    const b = await getSessionId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toBe(a);
  });

  it("stores tasks validated by the schema, ordered", async () => {
    const now = new Date().toISOString();
    const mk = (id: string, order: number) =>
      Task.parse({ id, title: id, order, createdAt: now, updatedAt: now });
    const db = await getDB();
    await db.put("tasks", mk("b", 2));
    await db.put("tasks", mk("a", 1));
    const all = await db.getAllFromIndex("tasks", "by-order");
    expect(all.map((t) => t.id)).toEqual(["a", "b"]);
    expect(all[0].dueAt).toBeNull();
  });
});
