import { ANCHOR_CHOICES } from "../questions/answers";
import type { Task } from "../schemas";

export const STALE_MS = 24 * 3_600_000; // older than this is not worth interrupting for
export const DEFAULT_SNOOZE_MIN = 10;

/** Reminders that are due and not yet shown. */
export function dueNow(tasks: readonly Task[], now: Date): Task[] {
  return tasks.filter(
    (t) => !t.done && t.dueAt !== null && !t.notifiedAt && Date.parse(t.dueAt) <= now.getTime(),
  );
}

export const isStale = (t: Task, now: Date) => Date.parse(t.dueAt!) < now.getTime() - STALE_MS;

export function snoozed(task: Task, minutes: number, now: Date): Task {
  const at = new Date(now.getTime() + minutes * 60_000).toISOString();
  return { ...task, dueAt: at, reminders: [at], notifiedAt: null, updatedAt: now.toISOString() };
}

/** The reminders the server should hold: future ones only, still open. */
export function upcomingReminders(tasks: readonly Task[], now: Date) {
  return tasks
    .filter((t) => !t.done && t.dueAt !== null && Date.parse(t.dueAt) > now.getTime())
    .map((t) => ({ taskId: t.id, fireAt: t.dueAt!, title: t.title }));
}

/** Tasks a one-tap trigger can fire: waiting on this event and not already done. */
export function triggerable(tasks: readonly Task[], anchor: string, now: Date): Task[] {
  return tasks.filter(
    (t) =>
      !t.done && t.anchor === anchor && (t.dueAt === null || Date.parse(t.dueAt) > now.getTime()),
  );
}

export const anchorsWaiting = (tasks: readonly Task[], now: Date): string[] =>
  [...new Set(tasks.filter((t) => t.anchor).map((t) => t.anchor!))].filter(
    // Only events a person can announce ("I'm leaving work"); prayer times come from the clock.
    (a) => a in ANCHOR_CHOICES && triggerable(tasks, a, now).length > 0,
  );

/** "17:07" becomes "17:00": rounding keeps a learned time stable from day to day. */
export function roundedClock(now: Date, stepMin = 15): string {
  const total = Math.round((now.getHours() * 60 + now.getMinutes()) / stepMin) * stepMin;
  const h = Math.floor(total / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
