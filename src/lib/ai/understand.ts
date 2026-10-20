import type { Locale } from "../i18n/locales";
import type { LearnedOptions } from "../memory/profile";
import type { Task } from "../schemas";
import { mergeIntoOpenLists, openListHint } from "../tasks/items";
import { parse } from "./client";
import { toTasks } from "./apply";
import { applyEdits, editCandidates, toOpenTasks } from "./edits";

export interface Understood {
  /** New tasks the sentence made. */
  fresh: Task[];
  /** Tasks the person already had that it altered (finished, moved, a list that grew). */
  changed: Task[];
  /** How `changed` looked before, so one Undo puts everything back. */
  before: Task[];
}

interface Context {
  tasks: readonly Task[];
  locale: Locale;
  hints: string[];
  options: LearnedOptions;
}

/** One sentence through the AI and into tasks. Throws an ApiError when the AI cannot be reached. */
export async function understand(
  text: string,
  { tasks, locale, hints, options }: Context,
): Promise<Understood> {
  // Open tasks that share a word with the sentence: it may be about one of them, not a new task.
  const candidates = editCandidates(text, tasks);
  const listHint = openListHint(tasks);
  const result = await parse({
    text,
    locale,
    hints: [...hints, ...(listHint ? [listHint] : [])].slice(0, 6),
    openTasks: toOpenTasks(candidates),
  });
  const now = new Date();
  const edited = applyEdits(result, candidates, now, options);
  const editedById = new Map(edited.map((e) => [e.id, e]));
  const current = tasks.map((x) => editedById.get(x.id) ?? x);
  // Things named for a list that is already open go onto that list.
  const { grown, fresh } = mergeIntoOpenLists(toTasks(result, now, current, options), current);
  grown.forEach((g) => editedById.set(g.id, g));
  const changed = [...editedById.values()];
  const ids = new Set(changed.map((c) => c.id));
  return { fresh, changed, before: tasks.filter((x) => ids.has(x.id)) };
}
