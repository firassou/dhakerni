/**
 * Parser eval. Runs every case in evals/cases.json through the real LLM + resolver and scores it.
 * Usage: npm run eval            (all)   |   npm run eval -- v01 a03   (selected ids)
 * Needs GOOGLE_GENERATIVE_AI_API_KEY (loaded from .env.local by the npm script). Costs real API calls.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseModelLabel } from "../src/lib/ai/model";
import { parseUtterance } from "../src/lib/ai/parse";
import type { ParseResult } from "../src/lib/ai/schema";
import { resolveWhen } from "../src/lib/time/resolve";

interface ExpectedReminder {
  status: "resolved" | "needs_time";
  at?: string;
  reason?: string;
}
interface Case {
  id: string;
  category: string;
  text: string;
  followUp?: { taskTitle: string; question: string };
  expect: {
    titles: string[][];
    reminders: ExpectedReminder[];
    shared?: boolean;
    priority?: string;
    recurrence?: string;
    smart?: {
      items?: { name: string[]; qty: number | null }[];
      itemCount?: number;
      titleExcludes?: string[];
      maxTasks?: number;
      twoTasks?: boolean;
      descHas?: string[][];
      titleShorter?: boolean;
      descDistinct?: boolean;
      /** The structure of the reminders is not what this case tests. */
      timeAny?: boolean;
      /** One task or two are both fine: the case tests descriptions, not how the idea is split. */
      anyTaskCount?: boolean;
      descMin?: boolean;
      decision?: boolean;
      decisionOptions?: number;
      recommendation?: boolean;
      noRecommendation?: boolean;
      minSuggestions?: number;
      minSteps?: number;
      noExtras?: boolean;
    };
  };
}

const spec = JSON.parse(readFileSync("evals/cases.json", "utf8")) as {
  now: string;
  timeZone: string;
  cases: Case[];
};
const now = new Date(spec.now);
const only = process.argv.slice(2);
const cases = only.length ? spec.cases.filter((c) => only.includes(c.id)) : spec.cases;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
const p = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) =>
  `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
    }
  }
}

type Checks = {
  count: boolean;
  titles: boolean;
  time: boolean;
  shared: boolean;
  extras: boolean;
  smart: boolean;
};

const words = (x: string) => x.trim().split(/\s+/).filter(Boolean).length;
const has = (text: string | null | undefined, alts: string[]) =>
  alts.some((a) => norm(text ?? "").includes(norm(a)));

/**
 * The "smart" checks. Cases without any smart expectation are still held to a quiet default: an ordinary
 * task must not come back with invented steps, a decision, or more than a single item.
 */
function scoreSmart(sm: Case["expect"]["smart"], out: ParseResult): boolean {
  const first = out.tasks[0];
  if (!first) return false;
  if (!sm || Object.keys(sm).length === 0) {
    return out.tasks.every(
      (t) => t.suggestedSteps.length === 0 && !t.decision && t.items.length <= 1,
    );
  }
  const ok: boolean[] = [];
  if (sm.noExtras)
    ok.push(
      out.tasks.every((t) => t.suggestedSteps.length === 0 && !t.decision && t.items.length === 0),
    );
  if (sm.maxTasks) ok.push(out.tasks.length <= sm.maxTasks);
  if (sm.twoTasks) ok.push(out.tasks.length === 2);
  if (sm.items) {
    ok.push(
      sm.items.every((want) =>
        first.items.some(
          (it) => has(it.name, want.name) && (want.qty === null || it.qty === want.qty),
        ),
      ),
    );
  }
  if (sm.itemCount) ok.push(first.items.length === sm.itemCount);
  if (sm.titleExcludes)
    ok.push(!sm.titleExcludes.some((w) => norm(first.title).split(/\s+/).includes(norm(w))));
  if (sm.descHas)
    ok.push(!!first.description && sm.descHas.every((alts) => has(first.description, alts)));
  if (sm.descDistinct)
    ok.push(new Set(out.tasks.map((t) => norm(t.description ?? ""))).size === out.tasks.length);
  if (sm.titleShorter)
    ok.push(!!first.description && words(first.title) < words(first.description));
  if (sm.descMin) ok.push(!!first.description && words(first.description) >= words(first.title));
  if (sm.decision) {
    const d = first.decision;
    ok.push(!!d && d.options.length >= (sm.decisionOptions ?? 2));
    if (sm.recommendation) ok.push(!!d?.recommendation);
    if (sm.noRecommendation) ok.push(!d?.recommendation);
  }
  if (sm.minSuggestions) ok.push(first.suggestedSteps.length >= sm.minSuggestions);
  if (sm.minSteps) ok.push(first.subtasks.length >= sm.minSteps);
  return ok.every(Boolean);
}

function score(c: Case, out: ParseResult) {
  const e = c.expect;
  const any = e.smart?.anyTaskCount === true;
  const count = any || out.tasks.length === e.titles.length;
  const titles =
    any ||
    (count &&
      e.titles.every((alts, i) => alts.some((a) => norm(out.tasks[i].title).includes(norm(a)))));

  const byId = new Map(out.reminders.map((r) => [r.id, r.when]));
  const got = out.tasks.map((t) => (t.reminderId ? byId.get(t.reminderId) : undefined));
  // distinct reminders in order of first use
  const distinct = [...new Map(got.filter(Boolean).map((w) => [w, w!])).values()];
  const resolutions = (distinct.length ? distinct : []).map((w) => resolveWhen(w!, now));
  if (!distinct.length) resolutions.push({ status: "needs_time", reason: "none", word: null });

  const time =
    e.smart?.timeAny === true ||
    (resolutions.length === e.reminders.length &&
      e.reminders.every((exp, i) => {
        const r = resolutions[i];
        if (exp.status === "resolved") return r.status === "resolved" && fmt(r.at) === exp.at;
        return r.status === "needs_time" && r.reason === exp.reason;
      }));

  const ids = new Set(out.tasks.map((t) => t.reminderId).filter(Boolean));
  const shared =
    e.shared === undefined
      ? true
      : e.shared
        ? out.tasks.length > 1 && ids.size === 1
        : ids.size > 1;
  const extras =
    (e.priority === undefined || out.tasks[0]?.priority === e.priority) &&
    (e.recurrence === undefined || out.tasks[0]?.recurrence?.freq === e.recurrence);
  const smart = scoreSmart(e.smart, out);
  const checks: Checks = { count, titles, time, shared, extras, smart };
  return { checks, pass: Object.values(checks).every(Boolean), resolutions };
}

const results: unknown[] = [];
const queue = [...cases];
async function worker() {
  for (let c = queue.shift(); c; c = queue.shift()) {
    const t0 = Date.now();
    try {
      const out = await withRetry(() =>
        parseUtterance({
          text: c.text,
          now: spec.now,
          timeZone: spec.timeZone,
          followUp: c.followUp,
        }),
      );
      const s = score(c, out);
      results.push({
        id: c.id,
        category: c.category,
        text: c.text,
        ms: Date.now() - t0,
        ...s,
        output: out,
      });
      console.log(
        `${s.pass ? "PASS" : "FAIL"} ${c.id} ${Object.entries(s.checks)
          .filter(([, v]) => !v)
          .map(([k]) => k)
          .join(",")}`,
      );
    } catch (err) {
      results.push({
        id: c.id,
        category: c.category,
        text: c.text,
        pass: false,
        error: String(err),
      });
      console.log(`ERR  ${c.id} ${String(err).slice(0, 100)}`);
    }
  }
}
await Promise.all([worker(), worker(), worker()]);

type R = {
  id: string;
  category: string;
  pass: boolean;
  checks?: Checks;
  text: string;
  error?: string;
};
const rs = (results as R[]).sort((a, b) => a.id.localeCompare(b.id));
const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(0)}%`;
console.log("\n=== By category ===");
for (const cat of [...new Set(rs.map((r) => r.category))]) {
  const g = rs.filter((r) => r.category === cat);
  console.log(
    `${cat.padEnd(14)} ${String(g.filter((r) => r.pass).length).padStart(2)}/${g.length}  ${pct(g.filter((r) => r.pass).length, g.length)}`,
  );
}
console.log("\n=== By check (cases where that field was right) ===");
for (const k of ["count", "titles", "time", "shared", "extras", "smart"] as const) {
  const g = rs.filter((r) => r.checks);
  console.log(`${k.padEnd(8)} ${pct(g.filter((r) => r.checks![k]).length, g.length)}`);
}
const pass = rs.filter((r) => r.pass).length;
console.log(
  `\nOVERALL ${pass}/${rs.length} = ${pct(pass, rs.length)} (strict: every field of a case must be right)`,
);
console.log(
  "Failures:",
  rs
    .filter((r) => !r.pass)
    .map((r) => r.id)
    .join(" ") || "none",
);
mkdirSync("evals/reports", { recursive: true });
writeFileSync(
  `evals/reports/${parseModelLabel().replace(/[^\w.-]/g, "_")}.json`,
  JSON.stringify(
    {
      model: parseModelLabel(),
      ran: new Date().toISOString(),
      results,
    },
    null,
    1,
  ),
);
