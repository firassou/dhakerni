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

const itemKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .trim();

/** Adds things to a checklist. One already on it is not listed twice: it is unchecked and its quantity grows. */
export function mergeItems(
  task: Task,
  extra: readonly Pick<Item, "name" | "qty" | "unit">[],
): Task {
  const items = task.items.slice();
  for (const add of extra) {
    const at = items.findIndex((i) => itemKey(i.name) === itemKey(add.name));
    if (at < 0) {
      items.push({
        id: crypto.randomUUID(),
        name: add.name,
        qty: add.qty,
        unit: add.unit,
        done: false,
      });
      continue;
    }
    const was = items[at];
    const qty = was.done
      ? add.qty
      : was.qty !== null && add.qty !== null
        ? was.qty + add.qty
        : (add.qty ?? was.qty);
    items[at] = { ...was, qty, unit: add.unit ?? was.unit, done: false };
  }
  return touch(task, { items });
}

/**
 * New things for a list that is already open belong on that list. A freshly parsed task goes into an open
 * checklist when it is only things (it has items), has no time of its own, and the open one is in the same
 * category. Returns the lists that grew and the tasks that stay new.
 */
export function mergeIntoOpenLists(
  created: readonly Task[],
  existing: readonly Task[],
): { grown: Task[]; fresh: Task[] } {
  const grown = new Map<string, Task>();
  const fresh: Task[] = [];
  for (const task of created) {
    const home =
      task.items.length > 0 && task.dueAt === null && task.list !== "inbox" && !task.recurrence
        ? existing
            .filter((e) => !e.done && e.items.length > 0 && e.list === task.list)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
        : undefined;
    if (!home) {
      fresh.push(task);
      continue;
    }
    grown.set(home.id, mergeItems(grown.get(home.id) ?? home, task.items));
  }
  return { grown: [...grown.values()], fresh };
}

/**
 * One sentence for the parser when a checklist is open, so a single thing named for it ("add milk") comes
 * back as an item and can join the list. Only the category names go along, never what is on the lists.
 */
export function openListHint(tasks: readonly Task[]): string | null {
  const lists = [
    ...new Set(
      tasks.filter((t) => !t.done && t.items.length > 0 && t.list !== "inbox").map((t) => t.list),
    ),
  ].slice(0, 3);
  if (!lists.length) return null;
  return `They have an open checklist in: ${lists.map((l) => `"${l.slice(0, 30)}"`).join(", ")}. When they name things to add to it, put each thing in items (even a single one, qty null) and use that same list.`;
}
