import { getMeta, setMeta } from "../db";
import type { Task } from "../schemas";
import { corrections, heardKey } from "./heard";
import { correctFact, isLearningOn, learnFact, OBS, type LearnResult } from "./profile";
import {
  countScripts,
  frequentTitle,
  fromMinutes,
  languageMix,
  normalizeTitle,
  pushObs,
  snoozeHabit,
  toMinutes,
  typicalPriority,
  usualTime,
  type ScriptCounts,
} from "./observe";

/**
 * Turns what the person does into profile facts. Everything here is skipped when learning is off, and
 * nothing here changes behavior on its own: a fact must repeat before it is trusted (see USE_THRESHOLD).
 */

const minutesOfDay = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};
const round = (n: number, step: number) => Math.round(n / step) * step;

async function append<T>(key: string, value: T): Promise<T[]> {
  const next = pushObs(await getMeta<T[]>(`${OBS}${key}`), value);
  await setMeta(`${OBS}${key}`, next);
  return next;
}

async function save(out: LearnResult[], r: Promise<LearnResult | null>) {
  const result = await r;
  if (result) out.push(result);
}

const FREQUENT_FROM = 3;
const TEMPLATES = `${OBS}templates`;
const MAX_TEMPLATES = 40;

/** A task added often, as it looked the last time: its title, category and checklist. */
export interface Template {
  title: string;
  list: string;
  items: { name: string; qty: number | null; unit: string | null }[];
}

async function rememberTemplate(key: string, task: Task) {
  const all = { ...((await getMeta<Record<string, Template>>(TEMPLATES)) ?? {}) };
  delete all[key]; // re-inserted last, so the oldest are the first to go
  all[key] = {
    title: task.title,
    list: task.list,
    items: task.items.map(({ name, qty, unit }) => ({ name, qty, unit })),
  };
  const keys = Object.keys(all);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_TEMPLATES))) delete all[old];
  await setMeta(TEMPLATES, all);
}

export const loadTemplates = async () => (await getMeta<Record<string, Template>>(TEMPLATES)) ?? {};

/** The transcript as heard against what the person sent: each word they fixed is worth remembering. */
export async function observeHeard(heard: string, sent: string): Promise<LearnResult[]> {
  const out: LearnResult[] = [];
  if (!(await isLearningOn())) return out;
  for (const [from, to] of corrections(heard, sent).slice(0, 5))
    await save(out, learnFact(heardKey(from), to, "behavior"));
  return out;
}

/** New tasks: how often a title repeats, language mix, and the time of day chosen per category. */
export async function observeCreated(tasks: readonly Task[]): Promise<LearnResult[]> {
  const out: LearnResult[] = [];
  if (!(await isLearningOn())) return out;
  for (const task of tasks) {
    const freq = { ...((await getMeta<Record<string, number>>(`${OBS}freq`)) ?? {}) };
    const title = normalizeTitle(task.title);
    freq[title] = (freq[title] ?? 0) + 1;
    await setMeta(`${OBS}freq`, freq);
    const f = frequentTitle(task.title, freq[title]);
    if (f) await save(out, learnFact(f.key, f.value, "behavior"));
    // From the third time on, keep how the task looked, so one tap can add it again.
    if (freq[title] >= FREQUENT_FROM) await rememberTemplate(title, task);

    const counts = countScripts(await getMeta<ScriptCounts>(`${OBS}scripts`), task.title);
    await setMeta(`${OBS}scripts`, counts);
    const mix = languageMix(counts);
    if (mix) await save(out, learnFact(mix.key, mix.value, "behavior"));

    // Only a clock time the person actually said teaches a usual time, never a default.
    if (task.list !== "inbox" && task.dueAt && task.timeBy === "said") {
      const times = await append(`usual.time.${task.list}`, minutesOfDay(task.dueAt));
      const u = usualTime(task.list, times);
      if (u) await save(out, learnFact(u.key, u.value, "behavior"));
    }
  }
  return out;
}

/** After the person edits a task: corrections to learned guesses, and new habits. */
export async function observeEdit(before: Task, after: Task): Promise<LearnResult[]> {
  const out: LearnResult[] = [];
  if (!(await isLearningOn())) return out;

  if (after.dueAt && after.dueAt !== before.dueAt) {
    if (before.assumed) {
      const { key } = before.assumed;
      if (key.startsWith("vague.")) {
        const minutes = Math.max(
          5,
          round((Date.parse(after.dueAt) - Date.parse(before.createdAt)) / 60_000, 5),
        );
        await save(out, correctFact(key, String(minutes)));
      } else if (key.startsWith("anchor.")) {
        await save(out, correctFact(key, fromMinutes(round(minutesOfDay(after.dueAt), 5))));
      } else if (key.startsWith("usual.time.")) {
        await save(out, correctFact(key, fromMinutes(round(minutesOfDay(after.dueAt), 15))));
      }
    } else if (after.list !== "inbox") {
      const times = await append(`usual.time.${after.list}`, minutesOfDay(after.dueAt));
      const u = usualTime(after.list, times);
      if (u) await save(out, learnFact(u.key, u.value, "behavior"));
    }
  }

  if (after.priority !== before.priority && after.priority !== "normal" && after.list !== "inbox") {
    const seen = await append(`priority.${after.list}`, after.priority);
    const p = typicalPriority(after.list, seen);
    if (p) await save(out, learnFact(p.key, p.value, "behavior"));
  }
  return out;
}

export async function observeSnooze(
  minutes: number,
  currentDefault: number,
): Promise<LearnResult[]> {
  const out: LearnResult[] = [];
  if (!(await isLearningOn())) return out;
  const chosen = await append("snooze", minutes);
  const habit = snoozeHabit(chosen, currentDefault);
  if (habit) await save(out, learnFact(habit.key, habit.value, "behavior"));
  return out;
}

export { toMinutes };
