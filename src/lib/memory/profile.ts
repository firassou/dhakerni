import { getDB, getMeta, setMeta } from "../db";
import type { ProfileFact } from "../schemas";
import type { ResolveOptions } from "../time/resolve";

export type FactSource = ProfileFact["source"];

/** A learned value is only used silently once it is at least this confident. */
export const USE_THRESHOLD = 0.6;
const CONFIRM_STEP = 0.15;
const CORRECTION_PENALTY = 0.25;
const CORR = "corr:";
export const OBS = "obs:";
const FIRST_CONFIDENCE = 0.75;
/** Learned from behavior alone: not used until the same value is seen again. */
const BEHAVIOR_CONFIDENCE = 0.4;
const CORRECTION_CONFIDENCE = 0.7;

export async function listFacts(): Promise<ProfileFact[]> {
  return (await getDB()).getAll("profile");
}

export async function isLearningOn(): Promise<boolean> {
  return (await getMeta<boolean>("learning")) !== false;
}

export const setLearning = (on: boolean) => setMeta("learning", on);

export interface LearnResult {
  fact: ProfileFact;
  /** True the first time this key is saved (drives the "Saved: ..." toast). */
  created: boolean;
  /** True when this save is what made the fact trusted enough to use. */
  becameUsable: boolean;
}

export const isUsable = (f: Pick<ProfileFact, "confidence">) => f.confidence >= USE_THRESHOLD;

/**
 * Saves one fact. Same value again raises confidence; a different value replaces the old one, because
 * a correction outweighs older data. Returns null when learning is switched off.
 */
export async function learnFact(
  key: string,
  value: string,
  source: FactSource,
  now: Date = new Date(),
): Promise<LearnResult | null> {
  if (!(await isLearningOn())) return null;
  const db = await getDB();
  const existing = await db.getFromIndex("profile", "by-key", key);
  const stamp = now.toISOString();
  let fact: ProfileFact;
  if (existing && existing.value === value) {
    fact = {
      ...existing,
      confidence: Math.min(1, existing.confidence + CONFIRM_STEP),
      updatedAt: stamp,
    };
  } else if (existing) {
    fact = { ...existing, value, source, confidence: CORRECTION_CONFIDENCE, updatedAt: stamp };
  } else {
    fact = {
      id: crypto.randomUUID(),
      key,
      value,
      source,
      confidence: source === "behavior" ? BEHAVIOR_CONFIDENCE : FIRST_CONFIDENCE,
      updatedAt: stamp,
    };
  }
  await db.put("profile", fact);
  await setMeta(`${CORR}${key}`, null);
  return {
    fact,
    created: !existing,
    becameUsable: isUsable(fact) && !(existing && isUsable(existing)),
  };
}

/**
 * The person changed a time the app had assumed. One contradiction is a warning: the old value loses trust
 * (so it may stop being used and the app asks again). The same new value twice in a row replaces it.
 * A correction that agrees with the stored value counts as a confirmation.
 */
export async function correctFact(
  key: string,
  value: string,
  now: Date = new Date(),
): Promise<LearnResult | null> {
  if (!(await isLearningOn())) return null;
  const db = await getDB();
  const existing = await db.getFromIndex("profile", "by-key", key);
  if (!existing) return null;
  if (existing.value === value) return learnFact(key, value, "behavior", now);

  const pending = await getMeta<string | null>(`${CORR}${key}`);
  if (pending === value) return learnFact(key, value, "behavior", now); // second time: replace
  const fact = {
    ...existing,
    confidence: Math.max(0, existing.confidence - CORRECTION_PENALTY),
    updatedAt: now.toISOString(),
  };
  await db.put("profile", fact);
  await setMeta(`${CORR}${key}`, value);
  return { fact, created: false, becameUsable: false };
}

export async function updateFactValue(id: string, value: string) {
  const db = await getDB();
  const fact = await db.get("profile", id);
  if (!fact) return;
  // Typed in by the person: as trusted as an answer.
  await db.put("profile", {
    ...fact,
    value,
    source: "manual",
    confidence: 1,
    updatedAt: new Date().toISOString(),
  });
  await setMeta(`${CORR}${fact.key}`, null);
}

export async function deleteFact(id: string) {
  const db = await getDB();
  const fact = await db.get("profile", id);
  await db.delete("profile", id);
  if (fact) await clearMetaPrefix(`${OBS}${fact.key}`);
}

async function clearMetaPrefix(prefix: string) {
  const db = await getDB();
  for (const k of await db.getAllKeys("meta")) {
    if (typeof k === "string" && k.startsWith(prefix)) await db.delete("meta", k);
  }
}

/** Forget everything learned: facts, the observations they came from, and pending corrections. */
export async function forgetAll() {
  const db = await getDB();
  await db.clear("profile");
  await clearMetaPrefix(OBS);
  await clearMetaPrefix(CORR);
}

export interface LearnedOptions extends ResolveOptions {
  /** Usual clock time per category: { work: "09:00" }. */
  categoryTimes?: Record<string, string>;
  /** Usual priority per category. */
  categoryPriority?: Record<string, "low" | "high">;
}

/** Facts the app may act on, as plain lookup tables. Facts below the trust threshold are ignored. */
export function toResolveOptions(facts: readonly ProfileFact[]): LearnedOptions {
  const vagueMinutes: Record<string, number> = {};
  const anchorTimes: Record<string, string> = {};
  const categoryTimes: Record<string, string> = {};
  const categoryPriority: Record<string, "low" | "high"> = {};
  for (const f of facts) {
    if (f.confidence < USE_THRESHOLD) continue;
    if (f.key.startsWith("usual.time.")) categoryTimes[f.key.slice("usual.time.".length)] = f.value;
    if (f.key.startsWith("priority.") && (f.value === "high" || f.value === "low")) {
      categoryPriority[f.key.slice("priority.".length)] = f.value;
    }
    if (f.key.startsWith("vague.")) {
      const n = Number(f.value);
      if (n > 0) vagueMinutes[f.key.slice("vague.".length)] = n;
    } else if (f.key.startsWith("anchor.")) {
      anchorTimes[f.key.slice("anchor.".length)] = f.value;
    }
  }
  return { vagueMinutes, anchorTimes, categoryTimes, categoryPriority };
}
