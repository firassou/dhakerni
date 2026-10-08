import { getDB } from "../db";
import type { Task } from "../schemas";

export async function loadTasks(): Promise<Task[]> {
  return (await getDB()).getAllFromIndex("tasks", "by-order");
}

export async function putTasks(tasks: readonly Task[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("tasks", "readwrite");
  await Promise.all([...tasks.map((t) => tx.store.put(t)), tx.done]);
}

export async function deleteTask(id: string): Promise<void> {
  await (await getDB()).delete("tasks", id);
}
