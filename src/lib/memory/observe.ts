import type { LearnedFactDraft } from "./types";

/**
 * Passive learning, as pure functions. Each one looks at recent observations and says what (if anything)
 * is worth remembering. A first sighting is saved with low confidence and is not used until the same
 * value shows up again (see USE_THRESHOLD in profile.ts).
 */

export const MAX_OBS = 12;
const WINDOW_MIN = 45; // observations this close to the median count as "the same time"

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const fromMinutes = (total: number) => {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const roundTo = (min: number, step: number) => Math.round(min / step) * step;

export const pushObs = <T>(list: readonly T[] | undefined, value: T): T[] =>
  [...(list ?? []), value].slice(-MAX_OBS);

/** Usual clock time for a category: needs 3+ observations, most of them close together. */
export function usualTime(list: string, minutes: readonly number[]): LearnedFactDraft | null {
  if (minutes.length < 3) return null;
  const sorted = [...minutes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const close = minutes.filter((m) => Math.abs(m - median) <= WINDOW_MIN);
  if (close.length < 3 || close.length / minutes.length < 0.6) return null;
  const avg = close.reduce((a, b) => a + b, 0) / close.length;
  return { key: `usual.time.${list}`, value: fromMinutes(roundTo(avg, 15)) };
}

/** Typical priority for a category: 3 of the last 4 non-normal choices agree. */
export function typicalPriority(
  list: string,
  priorities: readonly string[],
): LearnedFactDraft | null {
  const recent = priorities.slice(-4);
  if (recent.length < 3) return null;
  for (const p of ["high", "low"]) {
    if (recent.filter((x) => x === p).length >= 3) return { key: `priority.${list}`, value: p };
  }
  return null;
}

/** Snooze habit: the same non-default length picked three times in a row. */
export function snoozeHabit(
  chosen: readonly number[],
  currentDefault: number,
): LearnedFactDraft | null {
  const last = chosen.slice(-3);
  if (last.length < 3 || !last.every((m) => m === last[0]) || last[0] === currentDefault)
    return null;
  return { key: "snooze.default", value: String(last[0]) };
}

export interface ScriptCounts {
  arabic: number;
  latin: number;
  n: number;
}
const ARABIC = /[؀-ۿ]/;
const LATIN = /[A-Za-zÀ-ÿ]/;

export function countScripts(counts: ScriptCounts | undefined, title: string): ScriptCounts {
  const c = counts ?? { arabic: 0, latin: 0, n: 0 };
  return {
    arabic: c.arabic + (ARABIC.test(title) ? 1 : 0),
    latin: c.latin + (LATIN.test(title) ? 1 : 0),
    n: c.n + 1,
  };
}

/** Checked every 10 tasks so one batch of data cannot count as many confirmations. */
export function languageMix(c: ScriptCounts): LearnedFactDraft | null {
  if (c.n < 10 || c.n % 10 !== 0) return null;
  if (c.arabic / c.n >= 0.25 && c.latin / c.n >= 0.25)
    return { key: "language.mix", value: "arabic+latin" };
  return null;
}

export const normalizeTitle = (t: string) =>
  t
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Titles added again and again. Reported at 3, 5 and 10 times, not on every repeat. */
export function frequentTitle(title: string, count: number): LearnedFactDraft | null {
  return [3, 5, 10].includes(count)
    ? { key: `frequent.${normalizeTitle(title)}`, value: String(count) }
    : null;
}
