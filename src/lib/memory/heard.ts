import type { ProfileFact } from "../schemas";
import { isUsable } from "./profile";

/**
 * Learning from fixed transcripts. The person sees what was heard before it is sent; a word they change
 * into a similar-looking word is a mis-hearing, and the same fix seen again is applied for them next time.
 */

const PREFIX = "heard.";
const EDGE = /^[\s.,;:!?،؛؟"'«»()[\]]+|[\s.,;:!?،؛؟"'«»()[\]]+$/g;

const words = (text: string) =>
  text
    .split(/\s+/)
    .map((w) => w.replace(EDGE, ""))
    .filter(Boolean);
const norm = (w: string) => w.toLowerCase().replace(/[ً-ْـ]/g, "");

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** A changed word is a mis-hearing when most of it survived; a different word is a change of mind. */
function similar(a: string, b: string): boolean {
  if (a.length < 2 || b.length < 2 || /^\d+$/.test(a) || /^\d+$/.test(b)) return false;
  return distance(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) / 2));
}

/**
 * Words the person replaced one for one between what was heard and what they sent. Added, removed or
 * re-ordered words teach nothing: only a single word standing where another stood.
 */
export function corrections(heard: string, sent: string): [from: string, to: string][] {
  const a = words(heard);
  const b = words(sent);
  if (!a.length || !b.length || a.length > 200 || b.length > 200) return [];
  // Longest common subsequence, then walk back: a lone mismatch on both sides is a replacement.
  const lcs = a.map(() => new Array<number>(b.length + 1).fill(0));
  lcs.push(new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] =
        norm(a[i]) === norm(b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const out: [string, string][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && norm(a[i]) === norm(b[j])) {
      i++;
      j++;
      continue;
    }
    // A run of words with no match on either side.
    const si = i;
    const sj = j;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && norm(a[i]) === norm(b[j])) break;
      if (j >= b.length || (i < a.length && lcs[i + 1][j] >= lcs[i][j + 1])) i++;
      else j++;
    }
    if (i - si === 1 && j - sj === 1 && similar(norm(a[si]), norm(b[sj])))
      out.push([norm(a[si]), b[sj]]);
  }
  return out;
}

export const heardKey = (from: string) => `${PREFIX}${from}`;

/** Trusted fixes as a lookup: what was heard, to what the person means. */
export function heardFixes(facts: readonly ProfileFact[]): Record<string, string> {
  const fixes: Record<string, string> = {};
  for (const f of facts)
    if (f.key.startsWith(PREFIX) && isUsable(f)) fixes[f.key.slice(PREFIX.length)] = f.value;
  return fixes;
}

/** Puts the person's known fixes into a fresh transcript, whole words only. */
export function applyHeard(text: string, fixes: Record<string, string>): string {
  if (!Object.keys(fixes).length) return text;
  return text
    .split(/(\s+)/)
    .map((piece) => {
      const core = piece.replace(EDGE, "");
      const to = core ? fixes[norm(core)] : undefined;
      return to ? piece.replace(core, to) : piece;
    })
    .join("");
}
