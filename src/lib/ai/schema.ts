import { z } from "zod";

/**
 * The model never does date math. It describes WHEN in structured pieces and
 * our resolver turns that into an instant, using the user's clock and profile.
 * The shape is deliberately flat (no unions) so every provider handles it.
 */
export const DayPart = z.enum([
  "morning",
  "noon",
  "afternoon",
  "late_afternoon",
  "evening",
  "night",
]);
export type DayPart = z.infer<typeof DayPart>;

export const When = z.object({
  kind: z
    .enum(["absolute", "relative", "vague", "anchor", "none"])
    .describe(
      "absolute: a specific day and/or clock time or part of day. relative: an offset from now (after 10 minutes). vague: an imprecise word like شوية / later / tout à l'heure. anchor: tied to an event like after work, when I get home, after breakfast, after a prayer. none: no time mentioned.",
    ),
  day: z.enum(["today", "tomorrow", "after_tomorrow", "weekday", "date"]).nullable(),
  weekday: z
    .number()
    .int()
    .min(0)
    .max(6)
    .nullable()
    .describe("0=Sunday ... 6=Saturday. Only when day is weekday."),
  date: z.string().nullable().describe("YYYY-MM-DD. Only when day is date."),
  time: z.string().nullable().describe("24h HH:MM when an exact clock time was said."),
  dayPart: DayPart.nullable().describe(
    "morning=الصباح/matin, noon=نص النهار/midi, afternoon=بعد الظهر/après-midi, late_afternoon=العشية (not a prayer), evening=الليل بكري/soir, night=الليل/nuit.",
  ),
  offsetMinutes: z.number().int().positive().nullable().describe("Only for kind=relative."),
  vagueWord: z
    .string()
    .nullable()
    .describe("The imprecise word exactly as spoken. Only for kind=vague."),
  anchor: z
    .string()
    .nullable()
    .describe(
      "Normalized event key for kind=anchor: leave_work, arrive_home, leave_home, wake_up, after_breakfast, after_lunch, after_dinner, prayer_fajr/dhuhr/asr/maghrib/isha (at the prayer) or after_prayer_fajr/dhuhr/asr/maghrib/isha (shortly after). Use a short snake_case key for others.",
    ),
  confidence: z.number().min(0).max(1),
});
export type When = z.infer<typeof When>;

export const ParsedTask = z.object({
  title: z.string().min(1).describe("Short task text in the language spoken. Never translate."),
  notes: z.string().nullable(),
  priority: z
    .enum(["low", "normal", "high"])
    .nullable()
    .describe("null unless the user signalled importance."),
  list: z
    .string()
    .nullable()
    .describe(
      "Category such as work, home, health, shopping. In the user's language. null if unclear.",
    ),
  reminderId: z
    .string()
    .nullable()
    .describe("Id of an entry in reminders, so several tasks can share one reminder."),
  recurrence: z
    .object({
      freq: z.enum(["daily", "weekly", "monthly"]),
      interval: z.number().int().positive(),
      byWeekday: z.array(z.number().int().min(0).max(6)).nullable(),
    })
    .nullable(),
  subtasks: z.array(z.string()),
  uncertain: z
    .array(z.string())
    .describe("Names of fields you are unsure about, instead of guessing."),
});
export type ParsedTask = z.infer<typeof ParsedTask>;

export const ParseResult = z.object({
  tasks: z.array(ParsedTask),
  reminders: z.array(z.object({ id: z.string(), when: When })),
});
export type ParseResult = z.infer<typeof ParseResult>;

export const ParseRequest = z.object({
  text: z.string().min(1).max(2000),
  /** ISO instant of "now" on the device, and its IANA zone. */
  now: z.iso.datetime({ offset: true }),
  timeZone: z.string().min(1).max(64),
  locale: z.enum(["ar", "fr", "en"]).optional(),
  /** Minimal profile slice the caller chose to share, e.g. {"شوية":"20 min"}. */
  vocabulary: z.record(z.string().max(60), z.string().max(60)).optional(),
  /** Short hints from the learned profile, only those relevant to this text. */
  hints: z.array(z.string().max(200)).max(6).optional(),
  /** When the text answers a clarifying question about an existing task. */
  followUp: z.object({ taskTitle: z.string().max(300), question: z.string().max(300) }).optional(),
});
export type ParseRequest = z.infer<typeof ParseRequest>;
