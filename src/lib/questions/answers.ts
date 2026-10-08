import type { When } from "../ai/schema";
import type { Needs } from "../schemas";
import { nextOccurrence, resolveWhen } from "../time/resolve";

export type Answer =
  | { kind: "minutes"; minutes: number }
  | { kind: "clock"; time: string } // next time the clock shows this
  | { kind: "tomorrowMorning" }
  | { kind: "exact"; at: string }; // a full date the person spoke, e.g. "Friday 9am"

export interface QuickAnswer {
  id: string;
  /** i18n key, or a literal label (clock times) when `literal` is set. */
  labelKey?: string;
  vars?: Record<string, number>;
  literal?: string;
  answer: Answer;
}

/** Typical clock times offered per anchor. The first answer a person gives becomes their fact. */
export const ANCHOR_CHOICES: Record<string, string[]> = {
  leave_work: ["16:00", "17:00", "18:00"],
  arrive_home: ["17:30", "18:30", "19:30"],
  leave_home: ["07:30", "08:00", "08:30"],
  wake_up: ["06:30", "07:00", "07:30"],
  after_breakfast: ["07:30", "08:30", "09:30"],
  after_lunch: ["13:00", "13:30", "14:00"],
  after_dinner: ["20:30", "21:30", "22:30"],
};

const mins = (n: number): QuickAnswer =>
  n === 60
    ? { id: "m60", labelKey: "q.hour", answer: { kind: "minutes", minutes: 60 } }
    : { id: `m${n}`, labelKey: "q.min", vars: { n }, answer: { kind: "minutes", minutes: n } };

const tonight: QuickAnswer = {
  id: "tonight",
  labelKey: "q.tonight",
  answer: { kind: "clock", time: "21:00" },
};
const tomorrowMorning: QuickAnswer = {
  id: "tmr",
  labelKey: "q.tomorrowMorning",
  answer: { kind: "tomorrowMorning" },
};

/** 3 to 4 tappable answers for one question. */
export function quickAnswers(needs: Pick<Needs, "reason" | "word">): QuickAnswer[] {
  if (needs.reason === "anchor" && needs.word && ANCHOR_CHOICES[needs.word]) {
    return ANCHOR_CHOICES[needs.word].map((time) => ({
      id: `c${time}`,
      literal: time,
      answer: { kind: "clock", time },
    }));
  }
  if (needs.reason === "vague") return [mins(15), mins(30), mins(60), tonight];
  return [mins(30), mins(60), tonight, tomorrowMorning];
}

export function resolveAnswer(answer: Answer, now: Date): Date {
  switch (answer.kind) {
    case "minutes":
      return new Date(now.getTime() + answer.minutes * 60_000);
    case "clock": {
      const [h, m] = answer.time.split(":").map(Number);
      return nextOccurrence(now, [h, m]);
    }
    case "tomorrowMorning":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0);
    case "exact":
      return new Date(answer.at);
  }
}

export interface LearnedFact {
  key: string;
  value: string;
}

/**
 * What an answer teaches. Only answers that describe the word itself are saved: a duration for a vague
 * word ("شوية" = 20 min) or a daily clock time for an anchor. "Tonight" or "tomorrow morning" are
 * one-off choices and teach nothing.
 */
export function factFromAnswer(
  needs: Pick<Needs, "reason" | "word">,
  answer: Answer,
): LearnedFact | null {
  if (!needs.word) return null;
  if (needs.reason === "vague" && answer.kind === "minutes") {
    return { key: `vague.${needs.word}`, value: String(answer.minutes) };
  }
  if (needs.reason === "anchor" && answer.kind === "clock" && ANCHOR_CHOICES[needs.word]) {
    return { key: `anchor.${needs.word}`, value: answer.time };
  }
  return null;
}

/** Turns a spoken answer (already parsed into a `when`) into an Answer, when it is one we understand. */
export function answerFromWhen(when: When): Answer | null {
  if (when.kind === "relative" && when.offsetMinutes)
    return { kind: "minutes", minutes: when.offsetMinutes };
  if (when.kind === "absolute" && when.time && !when.day) return { kind: "clock", time: when.time };
  if (
    when.kind === "absolute" &&
    when.day === "tomorrow" &&
    !when.time &&
    (!when.dayPart || when.dayPart === "morning")
  ) {
    return { kind: "tomorrowMorning" };
  }
  if (when.kind === "absolute" && when.dayPart === "night" && (!when.day || when.day === "today")) {
    return { kind: "clock", time: "21:00" };
  }
  return null;
}

/** A spoken answer: a simple one we recognise, or any other time we can resolve exactly. */
export function answerFromSpoken(when: When, now: Date): Answer | null {
  const simple = answerFromWhen(when);
  if (simple) return simple;
  const r = resolveWhen(when, now);
  return r.status === "resolved" ? { kind: "exact", at: r.at.toISOString() } : null;
}
