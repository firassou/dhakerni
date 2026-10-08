import type { Task } from "../schemas";

export const STALE_MS = 24 * 3_600_000; // older than this is not worth interrupting for
export const DEFAULT_SNOOZE_MIN = 10;

/** The server's id for a task's earlier reminder. The service worker cuts the suffix off to find the task. */
export const EARLY_SUFFIX = "~early";
/** A reminder counts as shown if the task was notified within this long before it (clocks differ a little). */
const SHOWN_SLACK_MS = 60_000;

/** When the earlier reminder ("an hour before") fires, if the task has one. */
export function earlyAt(task: Pick<Task, "dueAt" | "remindBefore">): number | null {
  return task.dueAt && task.remindBefore
    ? Date.parse(task.dueAt) - task.remindBefore * 60_000
    : null;
}

/** Every moment this task reminds: the earlier one first, then the time itself. */
export function fireTimes(task: Pick<Task, "dueAt" | "remindBefore">): number[] {
  if (!task.dueAt) return [];
  const early = earlyAt(task);
  return early === null ? [Date.parse(task.dueAt)] : [early, Date.parse(task.dueAt)];
}

/** Reminders that are due and not yet shown. */
export function dueNow(tasks: readonly Task[], now: Date): Task[] {
  return tasks.filter((t) => {
    if (t.done) return false;
    const shown = t.notifiedAt ? Date.parse(t.notifiedAt) + SHOWN_SLACK_MS : -Infinity;
    return fireTimes(t).some((at) => at <= now.getTime() && at > shown);
  });
}

export const isStale = (t: Task, now: Date) => Date.parse(t.dueAt!) < now.getTime() - STALE_MS;

/**
 * Snoozing moves the task. Snoozing its earlier reminder does not: the appointment stays where it is and
 * only the heads-up comes again (or is dropped, when the time itself is nearer than the snooze).
 */
export function snoozed(task: Task, minutes: number, now: Date): Task {
  const again = now.getTime() + minutes * 60_000;
  if (task.dueAt && task.remindBefore && now.getTime() < Date.parse(task.dueAt)) {
    const left = Math.floor((Date.parse(task.dueAt) - again) / 60_000);
    const remindBefore = left > 0 ? left : null;
    return {
      ...task,
      remindBefore,
      reminders: remindBefore ? [new Date(again).toISOString(), task.dueAt] : [task.dueAt],
      notifiedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }
  const at = new Date(again).toISOString();
  return {
    ...task,
    dueAt: at,
    reminders: [at],
    remindBefore: null,
    notifiedAt: null,
    updatedAt: now.toISOString(),
  };
}

const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export interface ServerReminder {
  taskId: string;
  fireAt: string;
  title: string;
  /** Sent a single time: no repeats until answered. */
  once?: boolean;
}

/** The reminders the server should hold: future ones only, still open. */
export function upcomingReminders(tasks: readonly Task[], now: Date): ServerReminder[] {
  const out: ServerReminder[] = [];
  for (const t of tasks) {
    if (t.done || t.dueAt === null) continue;
    const due = Date.parse(t.dueAt);
    if (due <= now.getTime()) continue;
    const early = earlyAt(t);
    if (early !== null && early > now.getTime()) {
      // The heads-up says when the thing itself is, and is not repeated: the real reminder follows.
      out.push({
        taskId: `${t.id}${EARLY_SUFFIX}`,
        fireAt: new Date(early).toISOString(),
        title: `${t.title} (${clock(due)})`,
        once: true,
      });
    }
    out.push({ taskId: t.id, fireAt: t.dueAt, title: t.title });
  }
  return out;
}

export const DIGEST_ID = "digest";
export const DIGEST_HOUR = 21;

export interface DigestCounts {
  /** Open tasks due tomorrow. */
  tomorrow: number;
  /** Open tasks still waiting for a time. */
  needsTime: number;
}

/** What tomorrow looks like, for the evening summary. Null when there is nothing to say. */
export function digestCounts(tasks: readonly Task[], now: Date): DigestCounts | null {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).getTime();
  let tomorrow = 0;
  let needsTime = 0;
  for (const t of tasks) {
    if (t.done) continue;
    if (t.dueAt === null) needsTime++;
    else if (Date.parse(t.dueAt) >= start && Date.parse(t.dueAt) < end) tomorrow++;
  }
  return tomorrow || needsTime ? { tomorrow, needsTime } : null;
}

/** This evening's summary time, or null once it has passed: the next one is written tomorrow. */
export function digestAt(now: Date): Date | null {
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DIGEST_HOUR, 0, 0, 0);
  return at > now ? at : null;
}

/** Tasks a one-tap trigger can fire: waiting on this event and not already done. */
export function triggerable(tasks: readonly Task[], anchor: string, now: Date): Task[] {
  return tasks.filter(
    (t) =>
      !t.done && t.anchor === anchor && (t.dueAt === null || Date.parse(t.dueAt) > now.getTime()),
  );
}

/** Events that come from the clock (prayers, iftar, suhoor): nobody has to announce them. */
const fromClock = (anchor: string) => /^((after_|before_)?prayer_|iftar$|suhoor$)/.test(anchor);

/** Events with tasks waiting on them that a person can announce ("I'm leaving work", "Sami is here"). */
export const anchorsWaiting = (tasks: readonly Task[], now: Date): string[] =>
  [...new Set(tasks.filter((t) => t.anchor).map((t) => t.anchor!))].filter(
    (a) => !fromClock(a) && triggerable(tasks, a, now).length > 0,
  );

/** What to write on the button of an event the app has no name for: the person's own words. */
export function anchorWords(tasks: readonly Task[], anchor: string): string {
  const named = tasks.find((t) => t.anchor === anchor && !t.done && t.anchorLabel);
  return named?.anchorLabel ?? anchor.replace(/_/g, " ");
}

/** "17:07" becomes "17:00": rounding keeps a learned time stable from day to day. */
export function roundedClock(now: Date, stepMin = 15): string {
  const total = Math.round((now.getHours() * 60 + now.getMinutes()) / stepMin) * stepMin;
  const h = Math.floor(total / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
