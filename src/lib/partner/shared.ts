import { z } from "zod";
import { Priority, Recurrence, Task } from "../schemas";

/**
 * What travels to the partner when a task is sent: the task's content and nothing about the sender's
 * device (no id, no reminders, no learned guesses). The server holds it only until the partner's device
 * takes it. Bills are sent as plain tasks: the amount and reference stay on the sender's device.
 */
export const SharedTask = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).default(""),
  dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
  priority: Priority.default("normal"),
  list: z.string().max(40).default("inbox"),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        qty: z.number().positive().nullable().default(null),
        unit: z.string().max(30).nullable().default(null),
      }),
    )
    .max(50)
    .default([]),
  subtasks: z.array(z.string().min(1).max(200)).max(50).default([]),
  recurrence: Recurrence.nullable().default(null),
});
export type SharedTask = z.infer<typeof SharedTask>;

export const SendBody = z.object({ task: SharedTask });
export const StatusBody = z.object({
  shareId: z.string().min(1).max(64),
  done: z.boolean(),
  /** For the notification only ("Sami finished: ..."). */
  title: z.string().max(80).default(""),
});
/** What an inbox entry holds: a task, or a change of its done state. */
export const InboxEntry = z.object({
  id: z.string(),
  task: SharedTask.optional(),
  status: z.object({ shareId: z.string(), done: z.boolean() }).optional(),
});
export type InboxEntry = z.infer<typeof InboxEntry>;
export const AckBody = z.object({ ids: z.array(z.string().min(1).max(64)).max(100) });
export const JoinBody = z.object({ code: z.string().min(1).max(32) });

export function toShared(task: Task): SharedTask {
  return SharedTask.parse({
    title: task.title.slice(0, 200),
    notes: task.notes.slice(0, 2000),
    dueAt: task.dueAt,
    priority: task.priority,
    list: task.list === "bills" ? "inbox" : task.list.slice(0, 40),
    items: task.items.slice(0, 50).map((i) => ({ name: i.name, qty: i.qty, unit: i.unit })),
    subtasks: task.subtasks.slice(0, 50).map((s) => s.title),
    recurrence: task.recurrence,
  });
}

/** The task as it lands on the partner's list. `id` is the inbox id, so a delivery taken twice is one task. */
export function fromShared(
  shared: SharedTask,
  id: string,
  existing: readonly Task[],
  now: Date,
): Task {
  const minOrder = existing.reduce((m, t) => Math.min(m, t.order), 0);
  const stamp = now.toISOString();
  return Task.parse({
    id,
    title: shared.title,
    notes: shared.notes,
    dueAt: shared.dueAt,
    reminders: shared.dueAt ? [shared.dueAt] : [],
    priority: shared.priority,
    list: shared.list,
    recurrence: shared.recurrence,
    items: shared.items.map((i) => ({ id: crypto.randomUUID(), ...i, done: false })),
    subtasks: shared.subtasks.map((title) => ({ id: crypto.randomUUID(), title, done: false })),
    needs: shared.dueAt ? null : { reason: "none", word: null, dismissed: true },
    origin: "partner",
    share: { id, done: false },
    order: minOrder - 1,
    createdAt: stamp,
    updatedAt: stamp,
  });
}

/** The partner finished (or reopened) their copy: the same change on this one. Null when nothing differs. */
export function applyStatus(task: Task, done: boolean, now: Date): Task | null {
  if (!task.share) return null;
  if (task.done === done && task.share.done === done) return null;
  const stamp = now.toISOString();
  return {
    ...task,
    done,
    doneAt: done ? (task.doneAt ?? stamp) : null,
    share: { ...task.share, done },
    updatedAt: stamp,
  };
}
