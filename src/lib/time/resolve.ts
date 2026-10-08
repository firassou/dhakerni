import type { DayPart, When } from "../ai/schema";

/** Default clock time for each part of day. The user's profile overrides these (v0.5). */
export const DEFAULT_DAYPART_TIME: Record<DayPart, string> = {
  morning: "08:00",
  noon: "12:00",
  afternoon: "15:00",
  late_afternoon: "17:00",
  evening: "19:00",
  night: "21:00",
};

export type Resolution =
  | { status: "resolved"; at: Date }
  | { status: "needs_time"; reason: "vague" | "anchor" | "none"; word: string | null };

export interface ResolveOptions {
  dayPartTimes?: Partial<Record<DayPart, string>>;
  /** Learned meaning of vague words, in minutes: { "شوية": 20 }. */
  vagueMinutes?: Record<string, number>;
}

/** Canonical key for a vague word: "بعد شوية" and "شوية" are the same word. */
export function normalizeVague(word: string): string {
  return word
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/^(بعد|dans|in)\s+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseClock(value: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? [h, min] : null;
}

const atClock = (base: Date, [h, m]: [number, number], dayOffset: number) =>
  new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, h, m, 0, 0);

/** Turns the model's description of WHEN into an instant in the device's local time. */
export function resolveWhen(when: When, now: Date, opts: ResolveOptions = {}): Resolution {
  switch (when.kind) {
    case "none":
      return { status: "needs_time", reason: "none", word: null };

    case "anchor":
      return { status: "needs_time", reason: "anchor", word: when.anchor };

    case "vague": {
      const word = when.vagueWord ? normalizeVague(when.vagueWord) : null;
      const minutes = word ? opts.vagueMinutes?.[word] : undefined;
      if (minutes) return { status: "resolved", at: new Date(now.getTime() + minutes * 60_000) };
      return { status: "needs_time", reason: "vague", word };
    }

    case "relative": {
      if (!when.offsetMinutes) return { status: "needs_time", reason: "none", word: null };
      return { status: "resolved", at: new Date(now.getTime() + when.offsetMinutes * 60_000) };
    }

    case "absolute":
      return resolveAbsolute(when, now, opts);
  }
}

function resolveAbsolute(when: When, now: Date, opts: ResolveOptions): Resolution {
  const clock =
    (when.time && parseClock(when.time)) ||
    (when.dayPart &&
      parseClock(opts.dayPartTimes?.[when.dayPart] ?? DEFAULT_DAYPART_TIME[when.dayPart])) ||
    null;

  if (!when.day && !clock) return { status: "needs_time", reason: "none", word: null };

  // A day with no clock time ("tomorrow") defaults to morning.
  const time = clock ?? parseClock(DEFAULT_DAYPART_TIME.morning)!;

  let candidate: Date;
  switch (when.day) {
    case "today":
      candidate = atClock(now, time, 0);
      // "today" with no clock time and the morning already gone: ask later, don't invent one.
      if (!clock && candidate <= now) return { status: "needs_time", reason: "none", word: null };
      break;
    case "tomorrow":
      candidate = atClock(now, time, 1);
      break;
    case "after_tomorrow":
      candidate = atClock(now, time, 2);
      break;
    case "weekday": {
      if (when.weekday === null) return { status: "needs_time", reason: "none", word: null };
      const delta = (when.weekday - now.getDay() + 7) % 7;
      candidate = atClock(now, time, delta);
      if (delta === 0 && candidate <= now) candidate = atClock(now, time, 7);
      break;
    }
    case "date": {
      const m = when.date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(when.date) : null;
      if (!m) return { status: "needs_time", reason: "none", word: null };
      candidate = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), time[0], time[1]);
      break;
    }
    default:
      // Only a clock time or day part: today if still ahead, otherwise tomorrow.
      candidate = atClock(now, time, 0);
      if (candidate <= now) candidate = atClock(now, time, 1);
  }
  return { status: "resolved", at: candidate };
}
