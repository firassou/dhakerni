import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import type { When } from "../ai/schema";
import { DB_NAME, resetDBForTests, setMeta } from "../db";
import { forgetAll, learnFact, listFacts, toResolveOptions } from "../memory/profile";
import { Task } from "../schemas";
import { resolveWhen } from "../time/resolve";
import { answerFromWhen, factFromAnswer, quickAnswers, resolveAnswer } from "./answers";
import {
  askNow,
  dismiss,
  isQuestionOpen,
  OPEN_WINDOW_MS,
  resurfaceCandidates,
  reopen,
  RESURFACE_AFTER_MS,
} from "./ask";

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
  anchorLabel: null,
  leadMinutes: null,
  confidence: 0.9,
  ...p,
});
const task = (needs: Task["needs"], createdAt = now.toISOString()) =>
  Task.parse({ id: "t", title: "t", order: 0, createdAt, updatedAt: createdAt, needs });
const vague = {
  reason: "vague" as const,
  word: "شوية",
  group: "g",
  openedAt: now.toISOString(),
  dismissed: false,
  resurfaced: false,
};

describe("quick answers", () => {
  it("offers 3-4 answers for every kind of question", () => {
    for (const n of [
      vague,
      { reason: "anchor" as const, word: "leave_work" },
      { reason: "anchor" as const, word: "mystery" },
      { reason: "none" as const, word: null },
    ]) {
      const a = quickAnswers(n);
      expect(a.length).toBeGreaterThanOrEqual(3);
      expect(a.length).toBeLessThanOrEqual(4);
    }
  });
  it("vague answers are 15 min / 30 min / 1 h / tonight", () => {
    expect(quickAnswers(vague).map((a) => a.id)).toEqual(["m15", "m30", "m60", "tonight"]);
  });
  it("resolves each kind of answer", () => {
    expect(resolveAnswer({ kind: "minutes", minutes: 30 }, now)).toEqual(
      new Date(2026, 9, 8, 10, 30),
    );
    expect(resolveAnswer({ kind: "clock", time: "17:00" }, now)).toEqual(
      new Date(2026, 9, 8, 17, 0),
    );
    expect(resolveAnswer({ kind: "clock", time: "08:00" }, now)).toEqual(
      new Date(2026, 9, 9, 8, 0),
    ); // already past
    expect(resolveAnswer({ kind: "tomorrowMorning" }, now)).toEqual(new Date(2026, 9, 9, 8, 0));
  });
});

describe("what an answer teaches", () => {
  it("a duration for a vague word is a fact", () => {
    expect(factFromAnswer(vague, { kind: "minutes", minutes: 20 })).toEqual({
      key: "vague.شوية",
      value: "20",
    });
  });
  it("a clock time for an anchor is a fact", () => {
    expect(
      factFromAnswer({ reason: "anchor", word: "leave_work" }, { kind: "clock", time: "17:00" }),
    ).toEqual({ key: "anchor.leave_work", value: "17:00" });
  });
  it("one-off answers teach nothing", () => {
    expect(factFromAnswer(vague, { kind: "clock", time: "21:00" })).toBeNull();
    expect(factFromAnswer(vague, { kind: "tomorrowMorning" })).toBeNull();
  });
  it("understands spoken answers", () => {
    expect(answerFromWhen(when({ kind: "relative", offsetMinutes: 30 }))).toEqual({
      kind: "minutes",
      minutes: 30,
    });
    expect(answerFromWhen(when({ time: "17:30" }))).toEqual({ kind: "clock", time: "17:30" });
    expect(answerFromWhen(when({ day: "tomorrow", dayPart: "morning" }))).toEqual({
      kind: "tomorrowMorning",
    });
    expect(answerFromWhen(when({ dayPart: "night" }))).toEqual({ kind: "clock", time: "21:00" });
    expect(answerFromWhen(when({ kind: "vague", vagueWord: "شوية" }))).toBeNull();
  });
});

describe("resolver uses learned anchors", () => {
  it("resolves an anchor to the learned time and says why", () => {
    const r = resolveWhen(when({ kind: "anchor", anchor: "leave_work" }), now, {
      anchorTimes: { leave_work: "17:00" },
    });
    expect(r).toEqual({
      status: "resolved",
      at: new Date(2026, 9, 8, 17, 0),
      via: "anchor.leave_work",
    });
  });
  it("still asks when nothing is known", () => {
    expect(resolveWhen(when({ kind: "anchor", anchor: "leave_work" }), now).status).toBe(
      "needs_time",
    );
  });
});

describe("question lifecycle", () => {
  it("is open for 20 minutes, then collapses", () => {
    const t = task(vague);
    expect(isQuestionOpen(t, new Date(now.getTime() + OPEN_WINDOW_MS - 1000))).toBe(true);
    expect(isQuestionOpen(t, new Date(now.getTime() + OPEN_WINDOW_MS + 1000))).toBe(false);
  });
  it("closes when dismissed, and never opens for tasks with no time cue", () => {
    expect(isQuestionOpen(dismiss(task(vague)), now)).toBe(false);
    expect(
      isQuestionOpen(
        task({
          reason: "none",
          word: null,
          group: null,
          openedAt: now.toISOString(),
          dismissed: true,
          resurfaced: false,
        }),
        now,
      ),
    ).toBe(false);
  });
  it("re-surfaces exactly once, three hours later", () => {
    const t = task(vague);
    const later = new Date(now.getTime() + RESURFACE_AFTER_MS + 1000);
    expect(resurfaceCandidates([t], new Date(now.getTime() + 3600_000))).toEqual([]);
    expect(resurfaceCandidates([t], later)).toHaveLength(1);
    const again = reopen(t, later);
    expect(isQuestionOpen(again, later)).toBe(true);
    const muchLater = new Date(later.getTime() + 5 * 3600_000);
    expect(resurfaceCandidates([again], muchLater)).toEqual([]); // used up
  });
  it("asking on demand does not use up the automatic re-ask", () => {
    const t = askNow(dismiss(task(vague)), now);
    expect(isQuestionOpen(t, now)).toBe(true);
    expect(t.needs?.resurfaced).toBe(false);
  });
  it("copes with tasks saved before the question fields existed", () => {
    const old = { ...task(null), needs: { reason: "vague", word: "شوية" } } as Task;
    expect(isQuestionOpen(old, now)).toBe(false); // no openedAt: never asked, so not open
    expect(
      resurfaceCandidates(
        [{ ...old, createdAt: new Date(now.getTime() - 4 * 3600_000).toISOString() }],
        now,
      ),
    ).toHaveLength(1);
  });
});

describe("profile memory", () => {
  beforeEach(async () => {
    await resetDBForTests();
    await deleteDB(DB_NAME);
  });
  it("saves a fact with source, time and confidence, and marks the first save", async () => {
    const r = await learnFact("vague.شوية", "20", "answer", now);
    expect(r?.created).toBe(true);
    expect(r?.fact).toMatchObject({
      key: "vague.شوية",
      value: "20",
      source: "answer",
      updatedAt: now.toISOString(),
    });
    expect(r!.fact.confidence).toBeGreaterThan(0.6);
  });
  it("confirming raises confidence, a correction replaces the value", async () => {
    const first = (await learnFact("vague.شوية", "20", "answer"))!.fact.confidence;
    const again = await learnFact("vague.شوية", "20", "answer");
    expect(again?.created).toBe(false);
    expect(again!.fact.confidence).toBeGreaterThan(first);
    const fixed = await learnFact("vague.شوية", "45", "answer");
    expect(fixed?.fact.value).toBe("45");
    expect(await listFacts()).toHaveLength(1);
  });
  it("saves nothing while learning is off", async () => {
    await setMeta("learning", false);
    expect(await learnFact("vague.شوية", "20", "answer")).toBeNull();
    expect(await listFacts()).toEqual([]);
  });
  it("turns confident facts into resolver options and ignores weak ones", async () => {
    await learnFact("vague.شوية", "20", "answer");
    await learnFact("anchor.leave_work", "17:00", "answer");
    const opts = toResolveOptions(await listFacts());
    expect(opts.vagueMinutes).toEqual({ شوية: 20 });
    expect(opts.anchorTimes).toEqual({ leave_work: "17:00" });
    const weak = toResolveOptions([
      {
        id: "x",
        key: "vague.later",
        value: "60",
        source: "behavior",
        confidence: 0.3,
        updatedAt: now.toISOString(),
      },
    ]);
    expect(weak.vagueMinutes).toEqual({});
    await forgetAll();
    expect(await listFacts()).toEqual([]);
  });
});
