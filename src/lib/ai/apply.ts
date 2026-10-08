import { Task } from "../schemas";
import type { LearnedOptions } from "../memory/profile";
import { resolveWhen, type Resolution } from "../time/resolve";
import type { When } from "./schema";
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
  opts: LearnedOptions = {},
): Task[] {
  const whens = new Map(result.reminders.map((r) => [r.id, r.when]));
  const resolved = new Map<string, Resolution>();
  const groups = new Map<string, string>(); // one group id per unresolved reminder
  const perReminder = new Map<string, number>();
  for (const t of result.tasks)
    if (t.reminderId) perReminder.set(t.reminderId, (perReminder.get(t.reminderId) ?? 0) + 1);

  /**
   * A day with no clock time ("tomorrow") normally means morning. If this category has a trusted usual
   * time (work tasks at 09:00), use that instead. Only for a reminder owned by a single task, so tasks that
   * share a reminder always share the exact same time.
   */
  const usualFor = (when: When, list: string, reminderId: string) =>
    when.kind === "absolute" &&
    when.day &&
    !when.time &&
    !when.dayPart &&
    perReminder.get(reminderId) === 1
      ? opts.categoryTimes?.[list]
      : undefined;

  const resolve = (id: string, list: string): { res: Resolution | null; usual?: string } => {
    const when = whens.get(id);
    if (!when) return { res: null };
    const usual = usualFor(when, list, id);
    const key = usual ? `${id}@${list}` : id;
    if (!resolved.has(key))
      resolved.set(key, resolveWhen(usual ? { ...when, time: usual } : when, now, opts));
    return { res: resolved.get(key)!, usual };
  };

  const groupFor = (reminderId: string) => {
    if (!groups.has(reminderId)) groups.set(reminderId, crypto.randomUUID());
    return groups.get(reminderId)!;
  };

  const minOrder = existing.reduce((m, t) => Math.min(m, t.order), 0);
  const stamp = now.toISOString();
  const count = result.tasks.length;

  return result.tasks.map((t, i) => {
    const list = t.list?.trim() || "inbox";
    const { res, usual } = t.reminderId
      ? resolve(t.reminderId, list)
      : { res: null, usual: undefined };
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
    const assumed =
      res?.status === "resolved" && res.via
        ? learnedValue(res.via, opts)
        : usual && res?.status === "resolved"
          ? { key: `usual.time.${list}`, value: usual }
          : null;
    const timeBy =
      res?.status !== "resolved" || !when
        ? null
        : usual || res.via
          ? ("default" as const)
          : when.kind === "relative"
            ? ("relative" as const)
            : when.time
              ? ("said" as const)
              : ("default" as const);
    const uncertain = [...t.uncertain];
    if (dueAt && when && when.confidence < LOW_CONFIDENCE && !uncertain.includes("time"))
      uncertain.push("time");

    return Task.parse({
      id: crypto.randomUUID(),
      title: t.title.trim(),
      notes: t.notes ?? "",
      dueAt,
      reminders: dueAt ? [dueAt] : [],
      priority: t.priority ?? opts.categoryPriority?.[list] ?? "normal",
      list,
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
      timeBy,
      anchor: when?.kind === "anchor" ? when.anchor : null,
      order: minOrder - count + i, // first task on top, all above existing ones
      createdAt: stamp,
      updatedAt: stamp,
    });
  });
}

/** The learned value behind a silently resolved time, for the editable chip on the card. */
function learnedValue(via: string, opts: LearnedOptions) {
  const [kind, name] = [via.slice(0, via.indexOf(".")), via.slice(via.indexOf(".") + 1)];
  const value = kind === "vague" ? opts.vagueMinutes?.[name] : opts.anchorTimes?.[name];
  return value === undefined ? null : { key: via, value: String(value) };
}
