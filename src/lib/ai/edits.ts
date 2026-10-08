import type { LearnedOptions } from "../memory/profile";
import type { Task } from "../schemas";
import { completeTask } from "../tasks/recur";
import { resolveWhen } from "../time/resolve";
import type { ParseRequest, ParseResult } from "./schema";

const MAX_CANDIDATES = 5;
const MIN_WORD = 3;

/**
 * Words too common to say which task is meant. Without this, "the" alone would send the title of every
 * task that has it.
 */
const COMMON = new Set(
  (
    "the and for with from that this have has was not you your but then when after before today tomorrow " +
    "les des une pour avec dans sur que qui est pas mon mes ton tes apres avant demain aujourd " +
    "bech bach besh mta3 m3a fel mel elli ghodwa lyoum ba3d 9bal taw tawa " +
    "باش متاع مع من في على إلى الى اللي بعد قبل غدوة اليوم توا كيف هذا هذي"
  ).split(" "),
);

const tokens = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[ً-ْـ]/g, "")
      .split(/[^\p{L}\p{N}]+/u)
      // "الدوا" and "دوا" are the same word.
      .map((w) => w.replace(/^ال/u, ""))
      .filter((w) => w.length >= MIN_WORD && !COMMON.has(w)),
  );

/**
 * Open tasks this sentence might be about: those that share a word with it (in the title or the checklist).
 * Only these go to the AI, under short refs, so the rest of the list stays on the device.
 */
export function editCandidates(text: string, tasks: readonly Task[]): Map<string, Task> {
  const said = tokens(text);
  const out = new Map<string, Task>();
  if (!said.size) return out;
  const open = tasks.filter((t) => !t.done).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const task of open) {
    const own = tokens([task.title, ...task.items.map((i) => i.name)].join(" "));
    if ([...own].some((w) => said.has(w))) out.set(`t${out.size + 1}`, task);
    if (out.size >= MAX_CANDIDATES) break;
  }
  return out;
}

export function toOpenTasks(candidates: Map<string, Task>): ParseRequest["openTasks"] {
  if (!candidates.size) return undefined;
  return [...candidates].map(([ref, t]) => ({
    ref,
    title: t.title.slice(0, 300),
    ...(t.items.length
      ? {
          items: t.items
            .filter((i) => !i.done)
            .slice(0, 30)
            .map((i) => i.name.slice(0, 120)),
        }
      : {}),
  }));
}

const same = (a: string, b: string) => {
  const [x, y] = [a.trim().toLowerCase(), b.trim().toLowerCase()];
  return x === y || x.includes(y) || y.includes(x);
};

/**
 * The changes the parser asked for, applied to the tasks it pointed at. Anything it got wrong (an unknown
 * ref, a time that cannot be resolved, an item that is not on the list) is skipped, never guessed.
 */
export function applyEdits(
  result: Pick<ParseResult, "reminders"> & { edits?: ParseResult["edits"] },
  candidates: Map<string, Task>,
  now: Date,
  opts: LearnedOptions = {},
): Task[] {
  const changed = new Map<string, Task>();
  for (const edit of result.edits ?? []) {
    const original = candidates.get(edit.ref);
    if (!original) continue;
    const task = changed.get(original.id) ?? original;

    if (edit.action === "complete") {
      if (!task.done) changed.set(task.id, completeTask(task, now));
    } else if (edit.action === "reschedule") {
      const when = result.reminders.find((r) => r.id === edit.reminderId)?.when;
      const res = when ? resolveWhen(when, now, opts) : null;
      if (res?.status !== "resolved") continue;
      const dueAt = res.at.toISOString();
      const early = task.remindBefore
        ? new Date(res.at.getTime() - task.remindBefore * 60_000)
        : null;
      const keepEarly = early !== null && early > now;
      changed.set(task.id, {
        ...task,
        dueAt,
        reminders: keepEarly ? [early.toISOString(), dueAt] : [dueAt],
        remindBefore: keepEarly ? task.remindBefore : null,
        needs: null,
        assumed: null,
        timeBy: "said",
        notifiedAt: null,
        updatedAt: now.toISOString(),
      });
    } else if (edit.action === "check_item" && edit.item) {
      const hit = task.items.find((i) => !i.done && same(i.name, edit.item!));
      if (!hit) continue;
      changed.set(task.id, {
        ...task,
        items: task.items.map((i) => (i.id === hit.id ? { ...i, done: true } : i)),
        updatedAt: now.toISOString(),
      });
    }
  }
  return [...changed.values()];
}
