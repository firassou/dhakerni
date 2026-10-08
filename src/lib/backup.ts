import { z } from "zod";
import { getDB, getMeta, setMeta } from "./db";
import { LOCALE_STORAGE_KEY } from "./i18n/locales";
import { isCity } from "./prayer/cities";
import { forgetAll, isLearningOn, OBS } from "./memory/profile";
import { ProfileFact, Task } from "./schemas";

export const BACKUP_VERSION = 1;
const MAX_BYTES = 25 * 1024 * 1024;

const Envelope = z.object({
  app: z.literal("dhakerni"),
  backupVersion: z.number().int().positive(),
  appVersion: z.string().optional(),
  exportedAt: z.string().optional(),
  tasks: z.array(z.unknown()).default([]),
  profile: z.array(z.unknown()).default([]),
  observations: z.record(z.string(), z.unknown()).default({}),
  settings: z
    .object({
      learning: z.boolean().optional(),
      language: z.string().optional(),
      city: z.string().nullable().optional(),
    })
    .default({}),
});
export type Backup = {
  app: "dhakerni";
  backupVersion: number;
  appVersion: string;
  exportedAt: string;
  tasks: Task[];
  profile: ProfileFact[];
  observations: Record<string, unknown>;
  settings: { learning: boolean; language: string; city: string | null };
};

/** Everything the app keeps, as one JSON document. The anonymous session id stays on the device. */
export async function exportBackup(appVersion: string): Promise<Backup> {
  const db = await getDB();
  const observations: Record<string, unknown> = {};
  for (const key of await db.getAllKeys("meta")) {
    if (typeof key === "string" && key.startsWith(OBS))
      observations[key] = await db.get("meta", key);
  }
  let language = "system";
  try {
    language = localStorage.getItem(LOCALE_STORAGE_KEY) ?? "system";
  } catch {
    /* storage blocked: the default is fine */
  }
  return {
    app: "dhakerni",
    backupVersion: BACKUP_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    tasks: await db.getAll("tasks"),
    profile: await db.getAll("profile"),
    observations,
    settings: {
      learning: await isLearningOn(),
      language,
      city: (await getMeta<string>("city")) ?? null,
    },
  };
}

export type ParseResult =
  | {
      ok: true;
      tasks: Task[];
      profile: ProfileFact[];
      skipped: number;
      envelope: z.infer<typeof Envelope>;
    }
  | { ok: false; error: "too_large" | "not_json" | "wrong_file" | "too_new" };

/** Checks a backup file without touching any data. Bad items are skipped and counted, never trusted. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BYTES) return { ok: false, error: "too_large" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "not_json" };
  }
  const env = Envelope.safeParse(raw);
  if (!env.success) return { ok: false, error: "wrong_file" };
  if (env.data.backupVersion > BACKUP_VERSION) return { ok: false, error: "too_new" };

  let skipped = 0;
  const tasks: Task[] = [];
  for (const item of env.data.tasks) {
    const t = Task.safeParse(item);
    if (t.success) tasks.push(t.data);
    else skipped++;
  }
  const profile: ProfileFact[] = [];
  for (const item of env.data.profile) {
    const f = ProfileFact.safeParse(item);
    if (f.success) profile.push(f.data);
    else skipped++;
  }
  return { ok: true, tasks, profile, skipped, envelope: env.data };
}

export interface ImportReport {
  tasks: number;
  facts: number;
  skipped: number;
}

/** merge: keep what is here, the newer copy of anything in both wins. replace: this device becomes the backup. */
export async function importBackup(
  parsed: Extract<ParseResult, { ok: true }>,
  mode: "merge" | "replace",
): Promise<ImportReport> {
  const db = await getDB();
  if (mode === "replace") {
    await forgetAll();
    await db.clear("tasks");
  }

  let tasks = 0;
  for (const t of parsed.tasks) {
    const current = mode === "merge" ? await db.get("tasks", t.id) : undefined;
    if (current && current.updatedAt >= t.updatedAt) continue;
    await db.put("tasks", t);
    tasks++;
  }

  let facts = 0;
  for (const f of parsed.profile) {
    const current = await db.getFromIndex("profile", "by-key", f.key);
    if (current && current.updatedAt >= f.updatedAt) continue;
    await db.put("profile", current ? { ...f, id: current.id } : f); // keys are unique: keep the existing row id
    facts++;
  }

  if (mode === "replace") {
    for (const [key, value] of Object.entries(parsed.envelope.observations)) {
      if (key.startsWith(OBS)) await setMeta(key, value);
    }
    const city = parsed.envelope.settings.city;
    if (isCity(city)) await setMeta("city", city);
    if (typeof parsed.envelope.settings.learning === "boolean")
      await setMeta("learning", parsed.envelope.settings.learning);
    try {
      const lang = parsed.envelope.settings.language;
      if (lang === "system") localStorage.removeItem(LOCALE_STORAGE_KEY);
      else if (lang === "ar" || lang === "fr" || lang === "en")
        localStorage.setItem(LOCALE_STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }
  return { tasks, facts, skipped: parsed.skipped };
}

export { getMeta };
