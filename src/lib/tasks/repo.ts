import { getDB } from "../db";
import { Task } from "../schemas";

/**
 * Tasks saved by an older version are missing the fields added since (items, suggestions, ...). The schema
 * fills those in with safe defaults, so no screen ever meets a task of an older shape. A task that does not
 * fit the schema at all is kept, not dropped: the person's data is never silently lost.
 */
export function normalizeTask(raw: unknown): Task {
  const parsed = Task.safeParse(raw);
  if (parsed.success) return parsed.data;
  const r = (raw ?? {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    ...(r as unknown as Task),
    notes: typeof r.notes === "string" ? r.notes : "",
    reminders: arr(r.reminders),
    subtasks: arr(r.subtasks),
    items: arr(r.items),
    suggestions: arr(r.suggestions),
    uncertain: arr(r.uncertain),
    decision: null,
  };
}

export async function loadTasks(): Promise<Task[]> {
  const rows = await (await getDB()).getAllFromIndex("tasks", "by-order");
  return rows.map(normalizeTask);
}

export async function putTasks(tasks: readonly Task[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("tasks", "readwrite");
  await Promise.all([...tasks.map((t) => tx.store.put(t)), tx.done]);
}

export async function deleteTask(id: string): Promise<void> {
  await (await getDB()).delete("tasks", id);
}
