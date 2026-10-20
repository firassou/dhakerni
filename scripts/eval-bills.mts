/**
 * Bill extraction eval (text samples). Runs evals/bills.json through the real LLM and the same
 * normalisation the app uses, then compares provider, amount in millimes, due date and reference.
 * Usage: npm run eval:bills         Needs GOOGLE_GENERATIVE_AI_API_KEY (loaded from .env.local). Costs real API calls.
 * Photos are not covered here: they need real bill images, which are never committed.
 */
import { readFileSync } from "node:fs";
import { extractBill } from "../src/lib/ai/bill";
import { toDraft } from "../src/lib/bills/normalize";

interface Case {
  id: string;
  text: string;
  expect: {
    provider: string[];
    millimes: number;
    dueDate: string | null;
    reference: string | null;
  };
}
const spec = JSON.parse(readFileSync("evals/bills.json", "utf8")) as { now: string; cases: Case[] };
const now = new Date(spec.now);
const only = process.argv.slice(2);
const cases = only.length ? spec.cases.filter((c) => only.includes(c.id)) : spec.cases;

let passed = 0;
for (const c of cases) {
  const draft = toDraft(await extractBill({ kind: "text", text: c.text }, now), now);
  const checks = {
    provider: c.expect.provider.some((p) => draft.provider.toLowerCase().includes(p.toLowerCase())),
    amount: draft.amountMillimes === c.expect.millimes,
    dueDate: draft.dueDate === c.expect.dueDate,
    reference:
      c.expect.reference === null
        ? true
        : (draft.reference ?? "").replace(/\D/g, "").includes(c.expect.reference),
  };
  const ok = Object.values(checks).every(Boolean);
  if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${c.id}`, ok ? "" : JSON.stringify({ checks, draft }));
}
console.log(`\n${passed}/${cases.length} passed`);
process.exit(passed === cases.length ? 0 : 1);
