import type { Task } from "../schemas";
import { toggleDone } from "./ops";

const MAX_STEPS = 1000; // a guard, never reached by real data

const at = (base: Date, y: number, m: number, d: number) =>
  new Date(y, m, d, base.getHours(), base.getMinutes(), 0, 0);

/** The same clock time, `months` later. The 31st becomes the last day of a shorter month. */
function addMonths(base: Date, day: number, months: number): Date {
  const first = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return at(base, first.getFullYear(), first.getMonth(), Math.min(day, last));
}

/**
 * The next time a repeating task is due, strictly after `now`: same clock time, on the next day its rule
 * allows. Works on local dates, so a daily 08:00 stays 08:00 across a clock change.
 */
export function nextDue(task: Pick<Task, "dueAt" | "recurrence">, now: Date): Date | null {
  const rule = task.recurrence;
  if (!rule || !task.dueAt) return null;
  const base = new Date(task.dueAt);
  const every = Math.max(1, rule.interval);
  const days = rule.byWeekday?.length ? new Set(rule.byWeekday) : null;

  if (rule.freq === "monthly") {
    const day = base.getDate();
    for (let i = 1; i <= MAX_STEPS; i++) {
      const next = addMonths(base, day, i * every);
      if (next > now) return next;
    }
    return null;
  }

  if (rule.freq === "weekly" && days) {
    // Every allowed weekday, in every `every`-th week counted from the week of the first date.
    const sunday = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()).getTime();
    const weeksApart = (d: Date) => Math.round((sunday(d) - sunday(base)) / (7 * 86_400_000));
    for (let i = 1; i <= MAX_STEPS; i++) {
      const next = at(base, base.getFullYear(), base.getMonth(), base.getDate() + i);
      if (!days.has(next.getDay())) continue;
      if (weeksApart(next) % every !== 0) continue;
      if (next > now) return next;
    }
    return null;
  }

  const step = (rule.freq === "weekly" ? 7 : 1) * every;
  for (let i = 1; i <= MAX_STEPS; i++) {
    const next = at(base, base.getFullYear(), base.getMonth(), base.getDate() + i * step);
    if (next > now) return next;
  }
  return null;
}

export const isRepeating = (task: Pick<Task, "dueAt" | "recurrence">) =>
  !!task.recurrence && !!task.dueAt;

/**
 * Finishing a task. A repeating one is not put away: it moves to its next date with its checklist and
 * steps cleared, ready for the next round. Anything else is simply done (or reopened).
 */
export function completeTask(task: Task, now: Date): Task {
  const next = task.done ? null : nextDue(task, now);
  if (!next) return toggleDone(task, now);
  const dueAt = next.toISOString();
  const early = task.remindBefore
    ? new Date(next.getTime() - task.remindBefore * 60_000).toISOString()
    : null;
  return {
    ...task,
    dueAt,
    reminders: early ? [early, dueAt] : [dueAt],
    notifiedAt: null,
    items: task.items.map((i) => ({ ...i, done: false })),
    subtasks: task.subtasks.map((s) => ({ ...s, done: false })),
    updatedAt: now.toISOString(),
  };
}
