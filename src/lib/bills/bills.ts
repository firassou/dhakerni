import type { Task } from "../schemas";
import { newTask } from "./../tasks/ops";
import { completeTask, isRepeating } from "../tasks/recur";

export const BILLS_LIST = "bills";
/** The reminder before the due date, in minutes: two days. */
export const BILL_REMIND_BEFORE = 2 * 1440;
/** Bills are due at this hour on their date. */
const DUE_HOUR = 9;

export const isBill = (task: Task) => task.list === BILLS_LIST && task.bill !== null;
export const isPaid = (task: Task) => isBill(task) && task.bill!.paidAt !== null;

export interface BillInput {
  provider: string;
  amountMillimes: number;
  /** YYYY-MM-DD, local. */
  dueDate: string;
  reference: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  monthly: boolean;
}

/** The task that reminds about a bill: due at 09:00 on its date, with an earlier reminder if there is time. */
export function billTask(input: BillInput, existing: readonly Task[], now: Date): Task {
  const [y, m, d] = input.dueDate.split("-").map(Number);
  const due = new Date(y, m - 1, d, DUE_HOUR, 0, 0, 0);
  const dueAt = due.toISOString();
  const early = new Date(due.getTime() - BILL_REMIND_BEFORE * 60_000);
  const remindBefore = early > now ? BILL_REMIND_BEFORE : null;
  return newTask(input.provider, existing, now, {
    list: BILLS_LIST,
    dueAt,
    reminders: remindBefore ? [early.toISOString(), dueAt] : [dueAt],
    remindBefore,
    priority: "high",
    timeBy: "said",
    recurrence: input.monthly ? { freq: "monthly", interval: 1 } : null,
    needs: {
      reason: "none",
      word: null,
      group: null,
      openedAt: null,
      dismissed: true,
      resurfaced: false,
    },
    bill: {
      provider: input.provider,
      amountMillimes: input.amountMillimes,
      reference: input.reference,
      periodFrom: input.periodFrom ?? null,
      periodTo: input.periodTo ?? null,
      paidAt: null,
    },
  });
}

/**
 * Paying a bill. A monthly one moves on to next month and leaves a paid copy behind, so the history and
 * the month's total stay right; any other bill is simply marked paid.
 */
export function payBill(task: Task, now: Date): { paid: Task; next: Task | null } {
  const stamp = now.toISOString();
  const bill = { ...task.bill!, paidAt: stamp };
  if (isRepeating(task)) {
    return {
      paid: {
        ...task,
        id: crypto.randomUUID(),
        recurrence: null,
        bill,
        done: true,
        doneAt: stamp,
        updatedAt: stamp,
      },
      next: completeTask(task, now),
    };
  }
  return { paid: { ...task, bill, done: true, doneAt: stamp, updatedAt: stamp }, next: null };
}

/** Taking the payment back. */
export function unpayBill(task: Task, now: Date): Task {
  return {
    ...task,
    bill: { ...task.bill!, paidAt: null },
    done: false,
    doneAt: null,
    updatedAt: now.toISOString(),
  };
}

const startOfMonth = (d: Date, offset = 0) => new Date(d.getFullYear(), d.getMonth() + offset, 1);

/** Paid bills are kept for this month and the one before, then removed. */
export function expiredBills(tasks: readonly Task[], now: Date): Task[] {
  const keepFrom = startOfMonth(now, -1).getTime();
  return tasks.filter((t) => isPaid(t) && Date.parse(t.bill!.paidAt!) < keepFrom);
}

const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();

export interface BillsView {
  /** Unpaid, overdue first, then by date. */
  unpaid: Task[];
  /** Unpaid and due before the end of the 7th day from today (overdue included). */
  dueThisWeek: Task[];
  /** Paid, newest first. */
  paid: Task[];
  /** Everything unpaid that is due this calendar month, in millimes. */
  monthDueMillimes: number;
  /** What was paid so far this calendar month, in millimes. */
  monthPaidMillimes: number;
}

export function billsView(tasks: readonly Task[], now: Date): BillsView {
  const bills = tasks.filter(isBill);
  const unpaid = bills
    .filter((t) => !isPaid(t))
    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
  const paid = bills.filter(isPaid).sort((a, b) => b.bill!.paidAt!.localeCompare(a.bill!.paidAt!));
  const weekEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6));
  const monthStart = startOfMonth(now).getTime();
  const monthEnd = startOfMonth(now, 1).getTime();
  const inMonth = (iso: string) => {
    const at = Date.parse(iso);
    return at >= monthStart && at < monthEnd;
  };
  const sum = (list: Task[]) => list.reduce((s, t) => s + t.bill!.amountMillimes, 0);
  return {
    unpaid,
    dueThisWeek: unpaid.filter((t) => t.dueAt !== null && Date.parse(t.dueAt) < weekEnd),
    paid,
    monthDueMillimes: sum(unpaid.filter((t) => t.dueAt !== null && inMonth(t.dueAt))),
    monthPaidMillimes: sum(paid.filter((t) => inMonth(t.bill!.paidAt!))),
  };
}
