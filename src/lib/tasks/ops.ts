import { Task } from "../schemas";

export function newTask(
  title: string,
  existing: readonly Task[],
  now: Date,
  extra: Partial<Task> = {},
): Task {
  const minOrder = existing.reduce((m, t) => Math.min(m, t.order), 0);
  const stamp = now.toISOString();
  return Task.parse({
    id: crypto.randomUUID(),
    title: title.trim(),
    order: minOrder - 1, // newest on top
    createdAt: stamp,
    updatedAt: stamp,
    ...extra,
  });
}

export function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Move one visible task. The visible tasks trade places among the order slots
 * they already occupy, so hidden tasks keep their positions. Returns only the
 * tasks whose order changed.
 */
export function reorderVisible(visible: readonly Task[], from: number, to: number): Task[] {
  const slots = visible.map((t) => t.order).sort((a, b) => a - b);
  const moved = arrayMove(visible, from, to);
  const changed: Task[] = [];
  moved.forEach((t, i) => {
    if (t.order !== slots[i]) changed.push({ ...t, order: slots[i] });
  });
  return changed;
}

export function toggleDone(task: Task, now: Date): Task {
  const done = !task.done;
  const stamp = now.toISOString();
  return { ...task, done, doneAt: done ? stamp : null, updatedAt: stamp };
}
