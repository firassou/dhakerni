import { z } from "zod";

export const Priority = z.enum(["low", "normal", "high"]);

/** A field the model was unsure about is flagged instead of invented. */
export const Uncertain = z.array(z.string()).default([]);

export const Recurrence = z.object({
  freq: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().positive().default(1),
  byWeekday: z.array(z.number().int().min(0).max(6)).optional(),
});

export const Subtask = z.object({
  id: z.string(),
  title: z.string().min(1),
  done: z.boolean().default(false),
});

/**
 * Why a task has no time. For "vague" the word is the normalized vague word; for "anchor" it is the
 * anchor key (leave_work, ...). Tasks created together from one reminder share a group, so they are
 * asked about once.
 */
export const Needs = z.object({
  reason: z.enum(["vague", "anchor", "none"]),
  word: z.string().nullable(),
  group: z.string().nullable().default(null),
  openedAt: z.iso.datetime({ offset: true }).nullable().default(null),
  dismissed: z.boolean().default(false),
  resurfaced: z.boolean().default(false),
});
export type Needs = z.infer<typeof Needs>;

export const Item = z.object({
  id: z.string(),
  name: z.string().min(1),
  qty: z.number().positive().nullable().default(null),
  unit: z.string().nullable().default(null),
  done: z.boolean().default(false),
});
export type Item = z.infer<typeof Item>;

/** The AI's help with a choice. A suggestion, never an instruction: the person picks. */
export const Decision = z.object({
  options: z.array(z.string()).min(2),
  recommendation: z.string().nullable().default(null),
  reason: z.string().nullable().default(null),
  chosen: z.string().nullable().default(null),
});
export type Decision = z.infer<typeof Decision>;

/**
 * A bill, kept on the task that reminds about it. Money is whole millimes (1 DT = 1000), never a float.
 * The photo or PDF it was read from is not kept anywhere.
 */
export const Bill = z.object({
  provider: z.string().min(1),
  amountMillimes: z.number().int().nonnegative(),
  reference: z.string().nullable().default(null),
  /** The period the bill covers, as local dates (YYYY-MM-DD). */
  periodFrom: z.string().nullable().default(null),
  periodTo: z.string().nullable().default(null),
  paidAt: z.iso.datetime({ offset: true }).nullable().default(null),
});
export type Bill = z.infer<typeof Bill>;

export const Task = z.object({
  id: z.string(),
  title: z.string().min(1),
  notes: z.string().default(""),
  /** ISO 8601 instant. Null while the task is in the "Needs time" state. */
  dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
  reminders: z.array(z.iso.datetime({ offset: true })).default([]),
  priority: Priority.default("normal"),
  list: z.string().default("inbox"),
  recurrence: Recurrence.nullable().default(null),
  subtasks: z.array(Subtask).default([]),
  /** Things to get or bring, with quantities. */
  items: z.array(Item).default([]),
  /** Steps the AI proposed for a big goal. They become subtasks only if the person accepts them. */
  suggestions: z.array(z.string()).default([]),
  decision: Decision.nullable().default(null),
  uncertain: Uncertain,
  /** Why the task has no time yet. Drives the clarifying question (v0.4). */
  needs: Needs.nullable().default(null),
  /** How the time was decided. Only times the person chose ("said", "asked", "edited") teach the app. */
  timeBy: z.enum(["said", "relative", "default", "asked", "edited"]).nullable().default(null),
  /** Event this task waits for ("leave_work"), kept so a one-tap trigger can fire it early. */
  anchor: z.string().nullable().default(null),
  /** The event in the person's own words ("tji Sami"), for the trigger button of an event the app has no name for. */
  anchorLabel: z.string().nullable().default(null),
  /** Minutes before `dueAt` at which an extra, earlier reminder fires ("remind me an hour before"). */
  remindBefore: z.number().int().positive().nullable().default(null),
  /** When the reminder was shown, so it is never shown twice. */
  notifiedAt: z.iso.datetime({ offset: true }).nullable().default(null),
  /** Set when the time came from something the app learned, so the card can show an editable chip. */
  assumed: z.object({ key: z.string(), value: z.string() }).nullable().default(null),
  /** Saved while offline as written; the AI fills in time and details once the network is back. */
  aiPending: z.boolean().default(false),
  /** Set on bill tasks (list "bills"): who to pay, how much, and when it was paid. */
  bill: Bill.nullable().default(null),
  /** "partner" when the task was sent to this device by the partner. */
  origin: z.literal("partner").nullable().default(null),
  /** "partner" on the sender's copy of a task that was sent to the partner. */
  assignedTo: z.literal("partner").nullable().default(null),
  /**
   * Links this task to the partner's copy. `id` is the inbox id of the delivery; `done` is the state both
   * copies were last known to share, so a difference with `task.done` means "tell the partner".
   */
  share: z.object({ id: z.string(), done: z.boolean() }).nullable().default(null),
  done: z.boolean().default(false),
  doneAt: z.iso.datetime({ offset: true }).nullable().default(null),
  order: z.number(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Task = z.infer<typeof Task>;

export const ProfileFact = z.object({
  id: z.string(),
  /** Stable key such as "vague.shwaya" or "anchor.leaveWork". */
  key: z.string(),
  value: z.string(),
  source: z.enum(["answer", "behavior", "manual"]),
  confidence: z.number().min(0).max(1),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type ProfileFact = z.infer<typeof ProfileFact>;
