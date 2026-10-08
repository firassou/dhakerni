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
  offsetMinutes: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      "For kind=relative: minutes from now. For a before_prayer_/after_prayer_ anchor: the distance from the prayer when one was said (قبل المغرب بربع ساعة = 15). Else null.",
    ),
  vagueWord: z
    .string()
    .nullable()
    .describe("The imprecise word exactly as spoken. Only for kind=vague."),
  anchor: z
    .string()
    .nullable()
    .describe(
      "Normalized event key for kind=anchor: leave_work, arrive_home, leave_home, wake_up, after_breakfast, after_lunch, after_dinner, iftar, suhoor, prayer_fajr/dhuhr/asr/maghrib/isha (at the prayer), after_prayer_fajr/dhuhr/asr/maghrib/isha (shortly after) or before_prayer_fajr/dhuhr/asr/maghrib/isha (shortly before). For any other event use a short snake_case key that names it (sami_arrives, match_ends).",
    ),
  anchorLabel: z
    .string()
    .nullable()
    .describe(
      'Only for an anchor that is not in the list above: the event itself in the person\'s own words and script, 2 to 4 words ("tji Sami", "يوفى الماتش"). Else null.',
    ),
  leadMinutes: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      "Only when the person asks to be reminded BEFORE the time they gave (فكرني ساعة قبل = 60, rappelle-moi 30 min avant = 30, a day before = 1440). Else null.",
    ),
  confidence: z.number().min(0).max(1),
});
export type When = z.infer<typeof When>;

export const ParsedItem = z.object({
  name: z
    .string()
    .min(1)
    .describe("The thing, singular, in the language spoken. No quantity in it."),
  qty: z
    .number()
    .positive()
    .nullable()
    .describe("How many, as a number. null when no quantity was said."),
  unit: z
    .string()
    .nullable()
    .describe("kg, litre, bottle, box... in the language spoken. null for plain counts."),
});

export const ParsedDecision = z.object({
  options: z.array(z.string().min(1)).min(2).max(4).describe("The choices, each a short phrase."),
  recommendation: z
    .string()
    .nullable()
    .describe(
      "One of the options, only when what the person said is enough to lean one way. Else null.",
    ),
  reason: z
    .string()
    .nullable()
    .describe("One short sentence of reasoning that uses only what they said."),
});

export const ParsedTask = z.object({
  title: z
    .string()
    .min(1)
    .describe(
      "Short, clear action (verb + object, at most about 6 words), in the person's own language and script. No time words, filler or quantities. Never translate or formalize.",
    ),
  description: z
    .string()
    .nullable()
    .describe(
      "A clear restatement of the whole idea in the person's language and script, keeping every detail they gave: order, conditions, people, places, reasons. Adds nothing they did not say. null only when the title already says everything.",
    ),
  items: z
    .array(ParsedItem)
    .describe(
      "Things with quantities or a list of things (shopping, packing). Empty for ordinary tasks.",
    ),
  suggestedSteps: z
    .array(z.string().min(1))
    .max(4)
    .describe("Optional next steps for a big goal (a trip, an event). Empty for ordinary tasks."),
  decision: ParsedDecision.nullable().describe(
    "Only when the person is undecided between options or asks what to do.",
  ),
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

/** A change to a task the person already has, instead of a new task. */
export const ParsedEdit = z.object({
  ref: z.string().describe("The ref of one of the open tasks listed in the request."),
  action: z
    .enum(["complete", "reschedule", "check_item"])
    .describe(
      "complete: they say it is done. reschedule: they move it to another time. check_item: they got or did one thing of its checklist.",
    ),
  reminderId: z
    .string()
    .nullable()
    .describe("For reschedule: id of the entry in reminders that holds the new time. Else null."),
  item: z
    .string()
    .nullable()
    .describe("For check_item: the name of the item, as listed. Else null."),
});
export type ParsedEdit = z.infer<typeof ParsedEdit>;

export const ParseResult = z.object({
  tasks: z.array(ParsedTask),
  reminders: z.array(z.object({ id: z.string(), when: When })),
  edits: z
    .array(ParsedEdit)
    .describe("Changes to open tasks listed in the request. Empty when none were listed."),
});
export type ParseResult = z.infer<typeof ParseResult>;
/** The part that becomes new tasks. */
export type ParsedTasks = Pick<ParseResult, "tasks" | "reminders">;

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
  /**
   * Open tasks this sentence may be about: only those that share a word with it, never the whole list.
   * Lets "move the medicine to tomorrow" change a task instead of adding one.
   */
  openTasks: z
    .array(
      z.object({
        ref: z.string().max(8),
        title: z.string().max(300),
        items: z.array(z.string().max(120)).max(30).optional(),
      }),
    )
    .max(5)
    .optional(),
  /** When the text answers a clarifying question about an existing task. */
  followUp: z.object({ taskTitle: z.string().max(300), question: z.string().max(300) }).optional(),
});
export type ParseRequest = z.infer<typeof ParseRequest>;
