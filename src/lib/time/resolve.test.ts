import { describe, expect, it } from "vitest";
import type { When } from "../ai/schema";
import { normalizeVague, resolveWhen } from "./resolve";

// Thursday 8 Oct 2026, 10:00 local time
const now = new Date(2026, 9, 8, 10, 0);
const base: When = {
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
};
const w = (p: Partial<When>): When => ({ ...base, ...p });
const at = (r: ReturnType<typeof resolveWhen>) => (r.status === "resolved" ? r.at : null);
const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);

describe("resolveWhen", () => {
  it("relative offsets add minutes to now", () => {
    expect(at(resolveWhen(w({ kind: "relative", offsetMinutes: 10 }), now))).toEqual(
      local(8, 10, 10),
    );
  });
  it("tomorrow morning uses the morning default", () => {
    expect(at(resolveWhen(w({ day: "tomorrow", dayPart: "morning" }), now))).toEqual(local(9, 8));
  });
  it("tomorrow with no clock defaults to morning", () => {
    expect(at(resolveWhen(w({ day: "tomorrow" }), now))).toEqual(local(9, 8));
  });
  it("an explicit time beats the day-part default", () => {
    expect(at(resolveWhen(w({ day: "tomorrow", dayPart: "morning", time: "07:30" }), now))).toEqual(
      local(9, 7, 30),
    );
  });
  it("Friday evening (العشية) resolves to the coming Friday at 17:00", () => {
    expect(
      at(resolveWhen(w({ day: "weekday", weekday: 5, dayPart: "late_afternoon" }), now)),
    ).toEqual(local(9, 17));
  });
  it("the same weekday later today stays today, otherwise next week", () => {
    expect(at(resolveWhen(w({ day: "weekday", weekday: 4, time: "18:00" }), now))).toEqual(
      local(8, 18),
    );
    expect(at(resolveWhen(w({ day: "weekday", weekday: 4, time: "09:00" }), now))).toEqual(
      local(15, 9),
    );
  });
  it("a clock time already past today rolls to tomorrow", () => {
    expect(at(resolveWhen(w({ time: "08:00" }), now))).toEqual(local(9, 8));
    expect(at(resolveWhen(w({ time: "17:00" }), now))).toEqual(local(8, 17));
  });
  it("explicit dates are honoured", () => {
    expect(at(resolveWhen(w({ day: "date", date: "2026-12-25", time: "09:00" }), now))).toEqual(
      new Date(2026, 11, 25, 9, 0),
    );
  });
  it("vague words need a time unless the profile knows them", () => {
    const vague = w({ kind: "vague", vagueWord: "شوية" });
    expect(resolveWhen(vague, now)).toEqual({
      status: "needs_time",
      reason: "vague",
      word: "شوية",
    });
    expect(at(resolveWhen(vague, now, { vagueMinutes: { شوية: 20 } }))).toEqual(local(8, 10, 20));
  });
  it("normalizes vague words", () => {
    expect(normalizeVague("بعد شوية")).toBe("شوية");
    expect(normalizeVague("Tout à l'heure")).toBe("tout à l'heure");
    expect(
      at(
        resolveWhen(w({ kind: "vague", vagueWord: "بعد شوية" }), now, {
          vagueMinutes: { شوية: 20 },
        }),
      ),
    ).toEqual(local(8, 10, 20));
  });
  it("today with no clock time after the morning needs a time", () => {
    expect(resolveWhen(w({ day: "today" }), now).status).toBe("needs_time");
    expect(at(resolveWhen(w({ day: "today" }), new Date(2026, 9, 8, 6, 0)))).toEqual(local(8, 8));
  });
  it("anchors and missing times need a time", () => {
    expect(resolveWhen(w({ kind: "anchor", anchor: "leave_work" }), now)).toEqual({
      status: "needs_time",
      reason: "anchor",
      word: "leave_work",
    });
    expect(resolveWhen(w({ kind: "none" }), now).status).toBe("needs_time");
  });
  it("invalid clock strings do not resolve", () => {
    expect(resolveWhen(w({ time: "25:99" }), now).status).toBe("needs_time");
  });
});
