import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import { exportBackup, importBackup, parseBackup } from "./backup";
import { DB_NAME, getDB, getMeta, resetDBForTests, setMeta } from "./db";
import { learnFact, listFacts } from "./memory/profile";
import { Task } from "./schemas";

const stamp = (min: number) => new Date(Date.UTC(2026, 9, 8, 10, min)).toISOString();
const mk = (id: string, title: string, min: number) =>
  Task.parse({ id, title, order: 0, createdAt: stamp(0), updatedAt: stamp(min) });

beforeEach(async () => {
  await resetDBForTests();
  await deleteDB(DB_NAME);
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

async function seed() {
  const db = await getDB();
  await db.put("tasks", mk("a", "نشري الخبز", 1));
  await db.put("tasks", mk("b", "Appeler maman", 1));
  await learnFact("vague.شوية", "20", "answer");
  await setMeta("obs:freq", { x: 2 });
  await setMeta("sessionId", "device-only-id");
}

describe("backup", () => {
  it("round-trips tasks, the learned profile, and observations, but never the session id", async () => {
    await seed();
    const backup = await exportBackup("0.6.0");
    expect(JSON.stringify(backup)).not.toContain("device-only-id");
    expect(backup).toMatchObject({ app: "dhakerni", appVersion: "0.6.0" });

    await resetDBForTests();
    await deleteDB(DB_NAME);
    const parsed = parseBackup(JSON.stringify(backup));
    if (!parsed.ok) throw new Error("should parse");
    expect(await importBackup(parsed, "replace")).toEqual({ tasks: 2, facts: 1, skipped: 0 });
    expect((await (await getDB()).getAll("tasks")).map((t) => t.title).sort()).toEqual([
      "Appeler maman",
      "نشري الخبز",
    ]);
    expect((await listFacts())[0]).toMatchObject({ key: "vague.شوية", value: "20" });
    expect(await getMeta("obs:freq")).toEqual({ x: 2 });
    expect(await getMeta("sessionId")).toBeUndefined();
  });

  it("merge keeps this device's data and lets the newer copy win", async () => {
    await seed();
    const db = await getDB();
    await db.put("tasks", mk("c", "only here", 1));
    const parsed = parseBackup(
      JSON.stringify({
        app: "dhakerni",
        backupVersion: 1,
        tasks: [mk("a", "older copy", 0), mk("b", "newer copy", 5), mk("d", "new task", 1)],
        profile: [],
      }),
    );
    if (!parsed.ok) throw new Error("should parse");
    await importBackup(parsed, "merge");
    const titles = Object.fromEntries((await db.getAll("tasks")).map((t) => [t.id, t.title]));
    expect(titles).toEqual({ a: "نشري الخبز", b: "newer copy", c: "only here", d: "new task" });
  });

  it("replace discards what was here", async () => {
    await seed();
    const parsed = parseBackup(
      JSON.stringify({ app: "dhakerni", backupVersion: 1, tasks: [mk("z", "z", 1)], profile: [] }),
    );
    if (!parsed.ok) throw new Error("should parse");
    await importBackup(parsed, "replace");
    expect((await (await getDB()).getAll("tasks")).map((t) => t.id)).toEqual(["z"]);
    expect(await listFacts()).toEqual([]);
  });

  it("skips damaged items instead of trusting them", () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: "dhakerni",
        backupVersion: 1,
        tasks: [mk("a", "ok", 1), { id: 5 }, "junk"],
        profile: [{ nope: 1 }],
      }),
    );
    expect(parsed).toMatchObject({ ok: true, skipped: 3 });
    expect(parsed.ok && parsed.tasks).toHaveLength(1);
  });

  it("rejects files that are not a Dhakerni backup", () => {
    expect(parseBackup("not json")).toEqual({ ok: false, error: "not_json" });
    expect(parseBackup(JSON.stringify({ hello: 1 }))).toEqual({ ok: false, error: "wrong_file" });
    expect(parseBackup(JSON.stringify({ app: "dhakerni", backupVersion: 99, tasks: [] }))).toEqual({
      ok: false,
      error: "too_new",
    });
  });
});
