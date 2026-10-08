import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import { DB_NAME, getMeta, resetDBForTests, setMeta } from "../db";
import { Task } from "../schemas";
import { observeCreated, observeEdit, observeSnooze } from "./learning";
import {
  frequentTitle,
  languageMix,
  countScripts,
  snoozeHabit,
  typicalPriority,
  usualTime,
} from "./observe";
import {
  correctFact,
  forgetAll,
  learnFact,
  listFacts,
  toResolveOptions,
  updateFactValue,
} from "./profile";

const stamp = new Date(2026, 9, 8, 10, 0).toISOString();
const mk = (extra: Partial<Task>) =>
  Task.parse({
    id: crypto.randomUUID(),
    title: "t",
    order: 0,
    createdAt: stamp,
    updatedAt: stamp,
    ...extra,
  });
const at = (h: number, m = 0) => new Date(2026, 9, 9, h, m).toISOString();
const fact = async (key: string) => (await listFacts()).find((f) => f.key === key);

describe("passive pattern detection", () => {
  it("usual time needs 3 close observations, ignores outliers", () => {
    expect(usualTime("work", [540, 545])).toBeNull();
    expect(usualTime("work", [540, 550, 545])).toEqual({ key: "usual.time.work", value: "09:00" });
    expect(usualTime("work", [540, 1200, 300])).toBeNull(); // scattered: no habit
    expect(usualTime("work", [540, 545, 550, 1200])).toEqual({
      key: "usual.time.work",
      value: "09:00",
    });
  });
  it("typical priority: 3 of the last 4 agree", () => {
    expect(typicalPriority("work", ["high", "high"])).toBeNull();
    expect(typicalPriority("work", ["high", "low", "high", "high"])?.value).toBe("high");
    expect(typicalPriority("work", ["high", "low", "high", "low"])).toBeNull();
  });
  it("snooze habit: same non-default length three times", () => {
    expect(snoozeHabit([30, 30, 30], 10)?.value).toBe("30");
    expect(snoozeHabit([30, 30, 30], 30)).toBeNull();
    expect(snoozeHabit([30, 10, 30], 10)).toBeNull();
  });
  it("language mix is judged every 10 tasks, and needs both scripts", () => {
    let c = undefined as ReturnType<typeof countScripts> | undefined;
    for (let i = 0; i < 10; i++) c = countScripts(c, i % 2 ? "نعمل réunion" : "نشري الخبز");
    expect(languageMix(c!)).toEqual({ key: "language.mix", value: "arabic+latin" });
    expect(languageMix({ ...c!, n: 11 })).toBeNull();
    let only = undefined as ReturnType<typeof countScripts> | undefined;
    for (let i = 0; i < 10; i++) only = countScripts(only, "نشري الخبز");
    expect(languageMix(only!)).toBeNull();
  });
  it("frequent titles are reported at 3, 5 and 10 only", () => {
    expect([1, 2, 3, 4, 5, 9, 10].map((n) => !!frequentTitle("Appeler maman", n))).toEqual([
      false,
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
    expect(frequentTitle("Appeler  MAMAN", 3)?.key).toBe("frequent.appeler maman");
  });
});

describe("learning from behavior", () => {
  beforeEach(async () => {
    await resetDBForTests();
    await deleteDB(DB_NAME);
  });

  it("a usual time is saved untrusted, then trusted only after it repeats", async () => {
    const work = (h: number, m: number) => mk({ list: "work", dueAt: at(h, m), timeBy: "said" });
    for (const [h, m] of [
      [9, 0],
      [9, 10],
    ] as const)
      await observeCreated([work(h, m)]);
    expect(await fact("usual.time.work")).toBeUndefined();

    await observeCreated([work(9, 5)]); // third sighting: noticed, not yet trusted
    const first = await fact("usual.time.work");
    expect(first).toMatchObject({ value: "09:00", source: "behavior" });
    expect(toResolveOptions([first!]).categoryTimes).toEqual({}); // does not affect anything yet

    await observeCreated([work(9, 0)]);
    await observeCreated([work(9, 15)]);
    const trusted = await fact("usual.time.work");
    expect(trusted!.confidence).toBeGreaterThanOrEqual(0.6);
    expect(toResolveOptions([trusted!]).categoryTimes).toEqual({ work: "09:00" });
  });

  it("default and relative times teach nothing", async () => {
    for (let i = 0; i < 5; i++)
      await observeCreated([
        mk({ list: "work", dueAt: at(8), timeBy: "default" }),
        mk({ list: "work", dueAt: at(9), timeBy: "relative" }),
      ]);
    expect(await fact("usual.time.work")).toBeUndefined();
  });

  it("nothing is learned while learning is off", async () => {
    await setMeta("learning", false);
    for (let i = 0; i < 4; i++)
      await observeCreated([mk({ list: "work", dueAt: at(9), timeBy: "said", title: "same" })]);
    expect(await listFacts()).toEqual([]);
    expect(await getMeta("obs:freq")).toBeUndefined();
  });

  it("a repeated title is noticed at the third time", async () => {
    for (let i = 0; i < 3; i++) await observeCreated([mk({ title: "نشرب الدوا" })]);
    expect((await fact("frequent.نشرب الدوا"))?.value).toBe("3");
  });

  it("priority habit comes from edits, per category", async () => {
    const base = mk({ list: "work" });
    for (let i = 0; i < 3; i++) await observeEdit(base, { ...base, priority: "high" });
    expect((await fact("priority.work"))?.value).toBe("high");
    expect(await fact("priority.home")).toBeUndefined();
  });

  it("snooze habit is saved after three identical choices", async () => {
    for (let i = 0; i < 3; i++) await observeSnooze(30, 10);
    expect((await fact("snooze.default"))?.value).toBe("30");
  });
});

describe("corrections outweigh old data", () => {
  beforeEach(async () => {
    await resetDBForTests();
    await deleteDB(DB_NAME);
    await learnFact("vague.شوية", "20", "answer");
  });

  it("one contradiction lowers trust, so the app stops using it and asks again", async () => {
    const before = (await fact("vague.شوية"))!;
    await correctFact("vague.شوية", "45");
    const after = (await fact("vague.شوية"))!;
    expect(after.value).toBe("20");
    expect(after.confidence).toBeLessThan(before.confidence);
    expect(toResolveOptions([after]).vagueMinutes).toEqual({}); // below the trust threshold
  });

  it("the same correction twice replaces the value", async () => {
    await correctFact("vague.شوية", "45");
    await correctFact("vague.شوية", "45");
    expect((await fact("vague.شوية"))!.value).toBe("45");
  });

  it("a different second correction does not replace it", async () => {
    await correctFact("vague.شوية", "45");
    await correctFact("vague.شوية", "60");
    expect((await fact("vague.شوية"))!.value).toBe("20");
  });

  it("an edit that agrees confirms the fact", async () => {
    const before = (await fact("vague.شوية"))!.confidence;
    await correctFact("vague.شوية", "20");
    expect((await fact("vague.شوية"))!.confidence).toBeGreaterThan(before);
  });

  it("editing an assumed time in the editor feeds a correction", async () => {
    const task = mk({
      createdAt: at(10),
      dueAt: at(10, 20),
      assumed: { key: "vague.شوية", value: "20" },
    });
    await observeEdit(task, { ...task, dueAt: at(10, 45), assumed: null });
    const f = (await fact("vague.شوية"))!;
    expect(f.value).toBe("20");
    expect(f.confidence).toBeLessThan(0.75); // warned
  });

  it("a value typed by the person is fully trusted", async () => {
    const f = (await fact("vague.شوية"))!;
    await updateFactValue(f.id, "15");
    expect(await fact("vague.شوية")).toMatchObject({
      value: "15",
      source: "manual",
      confidence: 1,
    });
  });

  it("forget all removes facts and the observations behind them", async () => {
    for (let i = 0; i < 3; i++) await observeCreated([mk({ title: "x" })]);
    await correctFact("vague.شوية", "45");
    await forgetAll();
    expect(await listFacts()).toEqual([]);
    expect(await getMeta("obs:freq")).toBeUndefined();
    expect(await getMeta("corr:vague.شوية")).toBeUndefined();
  });
});
