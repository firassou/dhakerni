import { Task } from "../schemas";
import { resolveWhen, type Resolution, type ResolveOptions } from "../time/resolve";
import type { ParseResult } from "./schema";

const LOW_CONFIDENCE = 0.5;

/**
 * Turns the parser's output into tasks. Each reminder is resolved once, so tasks that
 * share a reminder get exactly the same time. Tasks without a resolvable time are still
 * created, in the "Needs time" state.
 */
export function toTasks(
  result: ParseResult,
  now: Date,
  existing: readonly Task[],
  opts: ResolveOptions = {},
): Task[] {
  const whens = new Map(result.reminders.map((r) => [r.id, r.when]));
  const resolved = new Map<string, Resolution>();
  const groups = new Map<string, string>(); // one group id per unresolved reminder
  const resolve = (id: string): Resolution | null => {
    const when = whens.get(id);
    if (!when) return null;
    if (!resolved.has(id)) resolved.set(id, resolveWhen(when, now, opts));
    return resolved.get(id)!;
  };

  const groupFor = (reminderId: string) => {
    if (!groups.has(reminderId)) groups.set(reminderId, crypto.randomUUID());
    return groups.get(reminderId)!;
  };

  const minOrder = existing.reduce((m, t) => Math.min(m, t.order), 0);
  const stamp = now.toISOString();
  const count = result.tasks.length;

  return result.tasks.map((t, i) => {
    const res = t.reminderId ? resolve(t.reminderId) : null;
    const when = t.reminderId ? whens.get(t.reminderId) : undefined;
    const dueAt = res?.status === "resolved" ? res.at.toISOString() : null;
    const needs =
      res?.status === "needs_time"
        ? {
            reason: res.reason,
            word: res.word,
            group: groupFor(t.reminderId!),
            openedAt: stamp,
            // No time cue at all: a plain task, nothing to ask.
            dismissed: res.reason === "none",
          }
        : res
          ? null
          : { reason: "none" as const, word: null, dismissed: true };
    const assumed = res?.status === "resolved" && res.via ? learnedValue(res.via, opts) : null;
    const uncertain = [...t.uncertain];
    if (dueAt && when && when.confidence < LOW_CONFIDENCE && !uncertain.includes("time"))
      uncertain.push("time");

    return Task.parse({
      id: crypto.randomUUID(),
      title: t.title.trim(),
      notes: t.notes ?? "",
      dueAt,
      reminders: dueAt ? [dueAt] : [],
      priority: t.priority ?? "normal",
      list: t.list?.trim() || "inbox",
      recurrence: t.recurrence
        ? {
            freq: t.recurrence.freq,
            interval: t.recurrence.interval,
            byWeekday: t.recurrence.byWeekday ?? undefined,
          }
        : null,
      subtasks: t.subtasks.map((title) => ({ id: crypto.randomUUID(), title, done: false })),
      uncertain,
      needs,
      assumed,
      order: minOrder - count + i, // first task on top, all above existing ones
      createdAt: stamp,
      updatedAt: stamp,
    });
  });
}

/** The learned value behind a silently resolved time, for the editable chip on the card. */
function learnedValue(via: string, opts: ResolveOptions) {
  const [kind, name] = [via.slice(0, via.indexOf(".")), via.slice(via.indexOf(".") + 1)];
  const value = kind === "vague" ? opts.vagueMinutes?.[name] : opts.anchorTimes?.[name];
  return value === undefined ? null : { key: via, value: String(value) };
}
