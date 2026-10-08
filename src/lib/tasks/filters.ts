import type { Task } from "../schemas";

export const FILTERS = ["today", "upcoming", "needsTime", "all", "done"] as const;
export type Filter = (typeof FILTERS)[number];

/** Start of the next local day, as epoch ms. */
export function endOfDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}

export function matchesFilter(task: Task, filter: Filter, now: Date): boolean {
  if (filter === "done") return task.done;
  if (task.done) return false;
  const due = task.dueAt === null ? null : Date.parse(task.dueAt);
  switch (filter) {
    case "today": // includes overdue
      return due !== null && due < endOfDay(now);
    case "upcoming":
      return due !== null && due >= endOfDay(now);
    case "needsTime":
      return due === null;
    case "all":
      return true;
  }
}

/** Open tasks follow the user's manual order; done tasks show newest first. */
export function selectTasks(tasks: Task[], filter: Filter, now: Date): Task[] {
  const list = tasks.filter((t) => matchesFilter(t, filter, now));
  if (filter === "done") {
    return list.sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  }
  return list.sort((a, b) => a.order - b.order);
}

/** Finished tasks are kept this long, then removed: the Done list is a short look back, not an archive. */
export const DONE_KEEP_MS = 24 * 3_600_000;

export function expiredDone(tasks: readonly Task[], now: Date): Task[] {
  const limit = now.getTime() - DONE_KEEP_MS;
  return tasks.filter((t) => t.done && Date.parse(t.doneAt ?? t.updatedAt) <= limit);
}

export function isOverdue(task: Task, now: Date): boolean {
  return !task.done && task.dueAt !== null && Date.parse(task.dueAt) < now.getTime();
}
