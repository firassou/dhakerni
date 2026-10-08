import type { Needs, Task } from "../schemas";

export const OPEN_WINDOW_MS = 20 * 60_000; // how long a question stays open
export const RESURFACE_AFTER_MS = 3 * 3_600_000; // asked again once, this long after creation

/** Missing fields come from tasks saved by older versions. */
export const norm = (n: Pick<Needs, "reason" | "word"> & Partial<Needs>): Needs => ({
  group: null,
  openedAt: null,
  dismissed: false,
  resurfaced: false,
  ...n,
});

/** Only imprecise times prompt a question. A task with no time cue at all is just a task. */
export const isAskable = (n: Needs) => n.reason === "vague" || n.reason === "anchor";

export function isQuestionOpen(task: Pick<Task, "needs" | "done">, now: Date): boolean {
  if (task.done || !task.needs) return false;
  const n = norm(task.needs);
  if (!isAskable(n) || n.dismissed || !n.openedAt) return false;
  return now.getTime() - Date.parse(n.openedAt) < OPEN_WINDOW_MS;
}

/** Tasks whose question was ignored and are due to be asked about once more. */
export function resurfaceCandidates(tasks: readonly Task[], now: Date): Task[] {
  return tasks.filter((t) => {
    if (t.done || !t.needs) return false;
    const n = norm(t.needs);
    return (
      isAskable(n) &&
      !n.resurfaced &&
      Date.parse(t.createdAt) + RESURFACE_AFTER_MS <= now.getTime() &&
      !isQuestionOpen(t, now)
    );
  });
}

export const reopen = (task: Task, now: Date): Task => ({
  ...task,
  needs: task.needs
    ? { ...norm(task.needs), dismissed: false, resurfaced: true, openedAt: now.toISOString() }
    : null,
});

export const dismiss = (task: Task): Task => ({
  ...task,
  needs: task.needs ? { ...norm(task.needs), dismissed: true } : null,
});

/** Tapping the "Needs time" chip asks again on demand, without using up the one automatic re-ask. */
export const askNow = (task: Task, now: Date): Task => ({
  ...task,
  needs: task.needs ? { ...norm(task.needs), dismissed: false, openedAt: now.toISOString() } : null,
});

/** Tasks that must be answered together: same group, or just the task itself. */
export function groupOf(tasks: readonly Task[], task: Task): Task[] {
  const g = task.needs?.group;
  return g ? tasks.filter((t) => t.needs?.group === g) : [task];
}
