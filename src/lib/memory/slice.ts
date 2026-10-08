import type { ProfileFact } from "../schemas";
import { normalizeVague } from "../time/resolve";
import { isUsable } from "./profile";

/**
 * The part of the profile worth sending with one request. Nothing else leaves the device: a fact goes
 * along only if it is trusted and relevant to the words in this very text.
 */
export function sliceForParse(facts: readonly ProfileFact[], text: string): string[] {
  const hints: string[] = [];
  const mix = facts.find((f) => f.key === "language.mix" && isUsable(f));
  if (mix)
    hints.push("They mix Arabic-script Derja with French or English words in the same sentence.");

  const haystack = normalizeVague(text);
  for (const f of facts) {
    if (!f.key.startsWith("vague.") || !isUsable(f)) continue;
    const word = f.key.slice("vague.".length);
    if (haystack.includes(word)) {
      hints.push(
        `"${word}" is a vague time word for them (about ${f.value} minutes): return it as kind vague with vagueWord "${word}".`,
      );
    }
  }
  return hints.slice(0, 6);
}
