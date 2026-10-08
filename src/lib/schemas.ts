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
  uncertain: Uncertain,
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
