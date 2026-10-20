import type { z } from "zod";
import { parseMillimes } from "../money";
import type { BillDraft, ParsedBill } from "../ai/bill-schema";

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
const latin = (s: string) =>
  s.replace(ARABIC_DIGITS, (d) => String((d.charCodeAt(0) - 0x660) % 0x90));

const DAY = 86_400_000;
/** A bill due further away than this from today is more likely a misread than a real deadline. */
const PLAUSIBLE_DAYS = 400;

const iso = (y: number, m: number, d: number): string | null => {
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/**
 * A printed date: year first (2026-10-29, 2026/10/29) or day first (dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy; bills in
 * Tunisia are day first). Hijri dates are not understood.
 */
function fromPrinted(printed: string): string | null {
  const text = latin(printed);
  const ymd = text.match(/(?<!\d)(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?!\d)/);
  if (ymd) return iso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  const dmy = text.match(/(?<!\d)(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4}|\d{2})(?!\d)/);
  if (!dmy) return null;
  const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
  return iso(year, Number(dmy[2]), Number(dmy[1]));
}

function fromIso(value: string): string | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? iso(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

/**
 * The deadline as a local date. The printed text wins over the model's own conversion when it is a
 * plain day-first date; a date far from today is dropped so the person is asked instead.
 */
export function resolveBillDate(
  printed: string | null,
  normalized: string | null,
  now: Date,
): string | null {
  const plausible = (date: string | null) => {
    if (!date) return null;
    const [y, m, d] = date.split("-").map(Number);
    return Math.abs(new Date(y, m - 1, d).getTime() - now.getTime()) / DAY <= PLAUSIBLE_DAYS
      ? date
      : null;
  };
  return plausible(printed && fromPrinted(printed)) || plausible(normalized && fromIso(normalized));
}

/** The covered period: both ends valid and in order, or neither. */
export function resolvePeriod(
  from: string | null,
  to: string | null,
): { periodFrom: string | null; periodTo: string | null } {
  const a = from && fromIso(from);
  const b = to && fromIso(to);
  return a && b && a <= b ? { periodFrom: a, periodTo: b } : { periodFrom: null, periodTo: null };
}

/** The model's reading, made safe: money in millimes, a checked date, and what is still unsure. */
export function toDraft(parsed: z.input<typeof ParsedBill>, now: Date): BillDraft {
  const amountMillimes = parsed.amount ? parseMillimes(parsed.amount) : null;
  const dueDate = resolveBillDate(parsed.dueDatePrinted, parsed.dueDate, now);
  const provider = parsed.provider?.trim() ?? "";
  const reference =
    (parsed.reference && latin(parsed.reference).replace(/\s+/g, " ").trim()) || null;

  const uncertain = new Set(parsed.uncertain);
  if (!provider) uncertain.add("provider");
  if (amountMillimes === null) uncertain.add("amount");
  if (!dueDate) uncertain.add("dueDate");
  return {
    provider,
    amountMillimes,
    dueDate,
    reference,
    ...resolvePeriod(parsed.periodFrom ?? null, parsed.periodTo ?? null),
    uncertain: [...uncertain],
  };
}
