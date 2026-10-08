import { describe, expect, it } from "vitest";
import { isCity, CITY_KEYS } from "./cities";
import { nextPrayerMoment, parsePrayerAnchor, prayerTimesOn } from "./times";
import { resolveWhen } from "../time/resolve";
import type { When } from "../ai/schema";

const tunis = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Tunis",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
const hm = (d: Date) => Number(tunis(d).slice(0, 2)) * 60 + Number(tunis(d).slice(3));

describe("prayer times (Tunis, 8 Oct 2026)", () => {
  const t = prayerTimesOn("tunis", new Date(Date.UTC(2026, 9, 8, 12)));
  it("come in the right order", () => {
    expect([t.fajr, t.dhuhr, t.asr, t.maghrib, t.isha].map((d) => d.getTime())).toEqual(
      [t.fajr, t.dhuhr, t.asr, t.maghrib, t.isha].map((d) => d.getTime()).sort((a, b) => a - b),
    );
  });
  it("fall in believable ranges for early October in Tunis (UTC+1)", () => {
    expect(hm(t.fajr)).toBeGreaterThan(4 * 60 + 30);
    expect(hm(t.fajr)).toBeLessThan(5 * 60 + 45);
    expect(hm(t.dhuhr)).toBeGreaterThan(11 * 60 + 45);
    expect(hm(t.dhuhr)).toBeLessThan(12 * 60 + 30);
    expect(hm(t.asr)).toBeGreaterThan(14 * 60 + 45);
    expect(hm(t.asr)).toBeLessThan(15 * 60 + 45);
    expect(hm(t.maghrib)).toBeGreaterThan(17 * 60 + 15);
    expect(hm(t.maghrib)).toBeLessThan(18 * 60 + 30);
    expect(hm(t.isha)).toBeGreaterThan(18 * 60 + 30);
    expect(hm(t.isha)).toBeLessThan(19 * 60 + 45);
  });
  it("summer days start earlier than winter ones", () => {
    const summer = prayerTimesOn("tunis", new Date(Date.UTC(2026, 5, 21, 12)));
    const winter = prayerTimesOn("tunis", new Date(Date.UTC(2026, 11, 21, 12)));
    const mins = (d: Date) => (d.getTime() % 86_400_000) / 60_000; // UTC clock
    expect(mins(summer.fajr)).toBeLessThan(mins(winter.fajr));
  });
  it("every listed city works", () => {
    for (const c of CITY_KEYS)
      expect(prayerTimesOn(c, new Date(Date.UTC(2026, 9, 8, 12))).asr.getTime()).toBeGreaterThan(0);
    expect(isCity("tunis")).toBe(true);
    expect(isCity("paris")).toBe(false);
  });
});

describe("prayer anchors", () => {
  it("parses at/after anchors and rejects others", () => {
    expect(parsePrayerAnchor("prayer_asr")).toEqual({ prayer: "asr", after: false });
    expect(parsePrayerAnchor("after_prayer_maghrib")).toEqual({ prayer: "maghrib", after: true });
    expect(parsePrayerAnchor("leave_work")).toBeNull();
    expect(parsePrayerAnchor("prayer_nope")).toBeNull();
  });
  it("'after' is 20 minutes later than 'at'", () => {
    const now = new Date(Date.UTC(2026, 9, 8, 6, 0));
    const at = nextPrayerMoment("tunis", "prayer_asr", now)!;
    const after = nextPrayerMoment("tunis", "after_prayer_asr", now)!;
    expect(after.getTime() - at.getTime()).toBe(20 * 60_000);
  });
  it("rolls to tomorrow once today's prayer has passed", () => {
    const late = new Date(Date.UTC(2026, 9, 8, 22, 0));
    const next = nextPrayerMoment("tunis", "prayer_asr", late)!;
    expect(next.getTime() - late.getTime()).toBeGreaterThan(10 * 3600_000);
    expect(next.getTime() - late.getTime()).toBeLessThan(24 * 3600_000);
  });
  it("the resolver uses it when a city is set, and asks otherwise", () => {
    const when: When = {
      kind: "anchor",
      day: null,
      weekday: null,
      date: null,
      time: null,
      dayPart: null,
      offsetMinutes: null,
      vagueWord: null,
      anchor: "after_prayer_asr",
      confidence: 1,
    };
    const now = new Date(Date.UTC(2026, 9, 8, 6, 0));
    const r = resolveWhen(when, now, { prayerMoment: (a, n) => nextPrayerMoment("tunis", a, n) });
    expect(r).toMatchObject({ status: "resolved", via: "prayer.after_prayer_asr" });
    expect(resolveWhen(when, now)).toMatchObject({ status: "needs_time", reason: "anchor" });
  });
});
