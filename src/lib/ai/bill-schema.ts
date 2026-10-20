import { z } from "zod";

/**
 * What the model read off a bill. It reports what is printed; the app turns it into millimes and a date
 * (see lib/bills/normalize.ts), so a wrong guess about a format never silently becomes a wrong amount.
 */
export const ParsedBill = z.object({
  /** Who is paid: STEG, SONEDE, Ooredoo, Tunisie Telecom, Orange, an insurer... as printed. */
  provider: z.string().nullable(),
  /** The total to pay exactly as printed, digits and separators included ("45,300", "٤٥٫٣٠٠"). */
  amount: z.string().nullable(),
  /** The payment deadline exactly as printed ("15/11/2026", "avant le 15 novembre"). */
  dueDatePrinted: z.string().nullable(),
  /** The same deadline as YYYY-MM-DD, only when the year, month and day are all certain. */
  dueDate: z.string().nullable(),
  /** Start and end of the period the bill covers ("du 03/06/2026 au 06/10/2026"), as YYYY-MM-DD. */
  periodFrom: z.string().nullable().default(null),
  periodTo: z.string().nullable().default(null),
  /** The bill / contract / customer reference number. */
  reference: z.string().nullable(),
  /** Fields it could not read with confidence: "provider", "amount", "dueDate", "reference". */
  uncertain: z.array(z.string()).default([]),
});
export type ParsedBill = z.infer<typeof ParsedBill>;

/** What the app gets back after normalising: ready to show in the review card. */
export const BillDraft = z.object({
  provider: z.string(),
  amountMillimes: z.number().int().nonnegative().nullable(),
  /** Local date, YYYY-MM-DD. */
  dueDate: z.string().nullable(),
  reference: z.string().nullable(),
  periodFrom: z.string().nullable(),
  periodTo: z.string().nullable(),
  uncertain: z.array(z.string()),
});
export type BillDraft = z.infer<typeof BillDraft>;
