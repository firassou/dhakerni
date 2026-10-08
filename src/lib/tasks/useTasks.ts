"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Task } from "../schemas";
import { newTask, reorderVisible } from "./ops";
import { completeTask } from "./recur";
import { deleteTask, loadTasks, putTasks } from "./repo";

/**
 * Optimistic task state: the UI updates first, IndexedDB follows.
 * Failed writes are logged and never block the interface.
 */
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ready, setReady] = useState(false);
  const ref = useRef<Task[]>([]);

  const commit = useCallback((next: Task[]) => {
    ref.current = next;
    setTasks(next);
  }, []);

  useEffect(() => {
    loadTasks()
      .then(commit)
      .catch((e) => console.error("load tasks failed", e))
      .finally(() => setReady(true));
  }, [commit]);

  /** Re-read from IndexedDB, e.g. after the service worker changed a task from a notification. */
  const reload = useCallback(async () => {
    try {
      commit(await loadTasks());
    } catch (e) {
      console.error("reload tasks failed", e);
    }
  }, [commit]);

  const save = useCallback((changed: Task[]) => {
    putTasks(changed).catch((e) => console.error("save tasks failed", e));
  }, []);

  const upsert = useCallback(
    (task: Task) => {
      const exists = ref.current.some((t) => t.id === task.id);
      commit(
        exists ? ref.current.map((t) => (t.id === task.id ? task : t)) : [...ref.current, task],
      );
      save([task]);
    },
    [commit, save],
  );

  const insert = useCallback(
    (created: Task[]) => {
      commit([...ref.current, ...created]);
      save(created);
    },
    [commit, save],
  );

  const add = useCallback(
    (title: string, extra?: Partial<Task>) => {
      const task = newTask(title, ref.current, new Date(), extra);
      upsert(task);
      return task;
    },
    [upsert],
  );

  const update = useCallback(
    (id: string, patch: Partial<Task>) => {
      const current = ref.current.find((t) => t.id === id);
      if (!current) return;
      upsert({ ...current, ...patch, updatedAt: new Date().toISOString() });
    },
    [upsert],
  );

  const toggle = useCallback(
    (id: string) => {
      const current = ref.current.find((t) => t.id === id);
      // A repeating task moves to its next date instead of being put away.
      if (current) upsert(completeTask(current, new Date()));
    },
    [upsert],
  );

  const remove = useCallback(
    (id: string) => {
      commit(ref.current.filter((t) => t.id !== id));
      deleteTask(id).catch((e) => console.error("delete failed", e));
    },
    [commit],
  );

  const move = useCallback(
    (visible: Task[], from: number, to: number) => {
      const changed = reorderVisible(visible, from, to);
      if (!changed.length) return;
      const byId = new Map(changed.map((t) => [t.id, t]));
      commit(ref.current.map((t) => byId.get(t.id) ?? t));
      save(changed);
    },
    [commit, save],
  );

  return {
    tasks,
    ready,
    reload,
    insert,
    getTasks: () => ref.current,
    add,
    update,
    toggle,
    remove,
    upsert,
    move,
  };
}
