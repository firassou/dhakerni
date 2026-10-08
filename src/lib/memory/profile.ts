import { getDB, getMeta, setMeta } from "../db";
import type { ProfileFact } from "../schemas";
import type { ResolveOptions } from "../time/resolve";

export type FactSource = ProfileFact["source"];

/** A learned value is only used silently once it is at least this confident. */
export const USE_THRESHOLD = 0.6;
const CONFIRM_STEP = 0.1;
const FIRST_CONFIDENCE = 0.75;
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
}

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
      confidence: FIRST_CONFIDENCE,
      updatedAt: stamp,
    };
  }
  await db.put("profile", fact);
  return { fact, created: !existing };
}

export async function deleteFact(id: string) {
  await (await getDB()).delete("profile", id);
}

export async function forgetAll() {
  await (await getDB()).clear("profile");
}

/** Facts the resolver may use, as plain lookup tables. */
export function toResolveOptions(facts: readonly ProfileFact[]): ResolveOptions {
  const vagueMinutes: Record<string, number> = {};
  const anchorTimes: Record<string, string> = {};
  for (const f of facts) {
    if (f.confidence < USE_THRESHOLD) continue;
    if (f.key.startsWith("vague.")) {
      const n = Number(f.value);
      if (n > 0) vagueMinutes[f.key.slice("vague.".length)] = n;
    } else if (f.key.startsWith("anchor.")) {
      anchorTimes[f.key.slice("anchor.".length)] = f.value;
    }
  }
  return { vagueMinutes, anchorTimes };
}
