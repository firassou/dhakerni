import type { Item, Task } from "../schemas";

/** "2× juice", "2 L milk", or just "bread" when no quantity was given. */
export function formatItem(item: Pick<Item, "name" | "qty" | "unit">, locale: string): string {
  if (item.qty === null || item.qty === undefined) return item.name;
  const qty = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(item.qty);
  return item.unit ? `${qty} ${item.unit} ${item.name}` : `${qty}× ${item.name}`;
}

export const itemsDone = (task: Pick<Task, "items">) => task.items.filter((i) => i.done).length;
export const stepsDone = (task: Pick<Task, "subtasks">) =>
  task.subtasks.filter((s) => s.done).length;

const touch = (task: Task, patch: Partial<Task>): Task => ({
  ...task,
  ...patch,
  updatedAt: new Date().toISOString(),
});

export const toggleItem = (task: Task, id: string): Task =>
  touch(task, { items: task.items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)) });

export const setItemQty = (task: Task, id: string, qty: number | null): Task =>
  touch(task, {
    items: task.items.map((i) =>
      i.id === id ? { ...i, qty: qty !== null && qty > 0 ? qty : null } : i,
    ),
  });

export const renameItem = (task: Task, id: string, name: string): Task =>
  touch(task, { items: task.items.map((i) => (i.id === id ? { ...i, name } : i)) });

export const removeItem = (task: Task, id: string): Task =>
  touch(task, { items: task.items.filter((i) => i.id !== id) });

export const addItem = (task: Task, name: string, qty: number | null = null): Task => {
  const clean = name.trim();
  if (!clean) return task;
  return touch(task, {
    items: [
      ...task.items,
      {
        id: crypto.randomUUID(),
        name: clean,
        qty: qty && qty > 0 ? qty : null,
        unit: null,
        done: false,
      },
    ],
  });
};

export const toggleStep = (task: Task, id: string): Task =>
  touch(task, { subtasks: task.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });

export const removeStep = (task: Task, id: string): Task =>
  touch(task, { subtasks: task.subtasks.filter((s) => s.id !== id) });

export const addStep = (task: Task, title: string): Task => {
  const clean = title.trim();
  if (!clean) return task;
  return touch(task, {
    subtasks: [...task.subtasks, { id: crypto.randomUUID(), title: clean, done: false }],
  });
};

/** A suggested step becomes a real step only when the person accepts it. */
export const acceptSuggestion = (task: Task, text: string): Task =>
  addStep({ ...task, suggestions: task.suggestions.filter((s) => s !== text) }, text);

export const dismissSuggestion = (task: Task, text: string): Task =>
  touch(task, { suggestions: task.suggestions.filter((s) => s !== text) });

export const dismissAllSuggestions = (task: Task): Task => touch(task, { suggestions: [] });

/** Picking an option settles the decision. Picking it again un-picks it. */
export const chooseOption = (task: Task, option: string): Task =>
  task.decision
    ? touch(task, {
        decision: { ...task.decision, chosen: task.decision.chosen === option ? null : option },
      })
    : task;
