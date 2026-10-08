import type { ProfileFact } from "../schemas";

type T = (key: string, vars?: Record<string, string | number>) => string;

/** Human wording for a learned fact, used in the toast and on the card chip. */
export function describeFact(fact: Pick<ProfileFact, "key" | "value">, t: T): string {
  const dot = fact.key.indexOf(".");
  const kind = fact.key.slice(0, dot);
  const name = fact.key.slice(dot + 1);
  if (kind === "vague") return t("facts.vague", { word: name, n: fact.value });
  const label = t(`anchors.${name}`);
  return t("facts.anchor", { label: label === `anchors.${name}` ? name : label, time: fact.value });
}

/** The question for a task that needs a time, in the user's language. */
export function questionText(needs: { reason: string; word: string | null }, t: T): string {
  if (needs.reason === "vague" && needs.word) return t("q.vague", { word: needs.word });
  if (needs.reason === "anchor" && needs.word) {
    const key = `q.anchor.${needs.word}`;
    const text = t(key);
    if (text !== key) return text;
  }
  return t("q.generic");
}
