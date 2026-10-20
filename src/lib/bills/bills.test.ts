import { describe, expect, it } from "vitest";
import type { Task } from "../schemas";
import { billsView, billTask, expiredBills, isPaid, payBill, unpayBill } from "./bills";
import { resolveBillDate, toDraft } from "./normalize";

const now = new Date(2026, 9, 21, 14, 0); // Wed 21 Oct 2026, local

const make = (over: Partial<Parameters<typeof billTask>[0]> = {}, at = now) =>
  billTask(
    {
      provider: "STEG",
      amountMillimes: 45_300,
      dueDate: "2026-10-30",
      reference: "123",
      monthly: false,
      ...over,
    },
    [],
    at,
  );

describe("resolveBillDate", () => {
  it("reads day-first printed dates, Arabic digits included", () => {
    expect(resolveBillDate("15/11/2026", null, now)).toBe("2026-11-15");
    expect(resolveBillDate("٠٥-١١-٢٠٢٦", null, now)).toBe("2026-11-05");
    expect(resolveBillDate("05.11.26", null, now)).toBe("2026-11-05");
  });
  it("reads a year-first date, as on a STEG bill", () => {
    expect(resolveBillDate("2026-10-29", "2026-10-29", now)).toBe("2026-10-29");
    expect(resolveBillDate("2026/10/29", null, now)).toBe("2026-10-29");
  });
  it("prefers the printed date to the model's own conversion", () => {
    expect(resolveBillDate("03/11/2026", "2026-03-11", now)).toBe("2026-11-03");
  });
  it("falls back to the normalised date, and rejects nonsense or far-off dates", () => {
    expect(resolveBillDate("avant le 15 novembre", "2026-11-15", now)).toBe("2026-11-15");
    expect(resolveBillDate("31/02/2026", null, now)).toBeNull();
    expect(resolveBillDate(null, "2031-01-01", now)).toBeNull();
    expect(resolveBillDate(null, null, now)).toBeNull();
  });
});

describe("toDraft", () => {
  it("turns the reading into millimes and flags what is missing", () => {
    const d = toDraft(
      {
        provider: " STEG ",
        amount: "45,300",
        dueDatePrinted: "15/11/2026",
        dueDate: null,
        reference: "  12 34 ",
        uncertain: [],
      },
      now,
    );
    expect(d).toMatchObject({
      provider: "STEG",
      amountMillimes: 45_300,
      dueDate: "2026-11-15",
      reference: "12 34",
      uncertain: [],
    });
    expect(
      toDraft(
        {
          ...{
            provider: "SONEDE",
            amount: "1",
            dueDatePrinted: null,
            dueDate: null,
            uncertain: [],
          },
          reference: "٧٣٩٠١٢٥",
        },
        now,
      ).reference,
    ).toBe("7390125");
    const bad = toDraft(
      {
        provider: null,
        amount: "n/a",
        dueDatePrinted: null,
        dueDate: null,
        reference: null,
        uncertain: [],
      },
      now,
    );
    expect(bad.uncertain.sort()).toEqual(["amount", "dueDate", "provider"]);
  });
});

describe("period", () => {
  it("keeps a valid period and drops a reversed one", () => {
    const base = {
      provider: "STEG",
      amount: "1",
      dueDatePrinted: null,
      dueDate: null,
      reference: null,
      uncertain: [],
    };
    expect(
      toDraft({ ...base, periodFrom: "2026-06-03", periodTo: "2026-10-06" }, now),
    ).toMatchObject({ periodFrom: "2026-06-03", periodTo: "2026-10-06" });
    expect(
      toDraft({ ...base, periodFrom: "2026-10-06", periodTo: "2026-06-03" }, now),
    ).toMatchObject({ periodFrom: null, periodTo: null });
    expect(
      toDraft({ ...base, periodFrom: "2026-06-03", periodTo: null }, now).periodFrom,
    ).toBeNull();
  });
});

describe("billTask", () => {
  it("is due at 09:00 with a reminder two days before", () => {
    const t = make();
    expect(new Date(t.dueAt!).getHours()).toBe(9);
    expect(t.list).toBe("bills");
    expect(t.remindBefore).toBe(2880);
    expect(t.reminders).toHaveLength(2);
    expect(t.bill).toMatchObject({ provider: "STEG", amountMillimes: 45_300, paidAt: null });
  });
  it("skips the early reminder when the bill is due sooner than that", () => {
    const t = make({ dueDate: "2026-10-22" });
    expect(t.remindBefore).toBeNull();
    expect(t.reminders).toHaveLength(1);
  });
});

describe("payBill", () => {
  it("marks a one-off bill paid, and can take it back", () => {
    const { paid, next } = payBill(make(), now);
    expect(next).toBeNull();
    expect(isPaid(paid)).toBe(true);
    expect(paid.done).toBe(true);
    expect(isPaid(unpayBill(paid, now))).toBe(false);
  });
  it("moves a monthly bill on and leaves a paid copy", () => {
    const monthly = make({ monthly: true });
    const { paid, next } = payBill(monthly, now);
    expect(paid.id).not.toBe(monthly.id);
    expect(paid.recurrence).toBeNull();
    expect(next?.id).toBe(monthly.id);
    expect(new Date(next!.dueAt!).getMonth()).toBe(10); // November
    expect(next!.bill!.paidAt).toBeNull();
  });
});

describe("retention and totals", () => {
  const paidOn = (when: Date, amount = 10_000): Task =>
    payBill({ ...make({ amountMillimes: amount }), id: crypto.randomUUID() }, when).paid;

  it("keeps paid bills of this and the previous month only", () => {
    const keep = [paidOn(new Date(2026, 9, 2)), paidOn(new Date(2026, 8, 1, 0, 1))];
    const drop = paidOn(new Date(2026, 7, 31, 23, 0));
    expect(expiredBills([...keep, drop], now)).toEqual([drop]);
  });

  it("totals the month and lists what is due this week", () => {
    const week = make({ dueDate: "2026-10-25", amountMillimes: 20_000 });
    const later = make({ dueDate: "2026-10-30", amountMillimes: 30_000 });
    const nextMonth = make({ dueDate: "2026-11-10", amountMillimes: 40_000 });
    const overdue = make({ dueDate: "2026-10-18", amountMillimes: 5_000 });
    const paidNow = paidOn(new Date(2026, 9, 3), 7_000);
    const v = billsView([week, later, nextMonth, overdue, paidNow], now);
    expect(v.unpaid.map((t) => t.bill!.amountMillimes)).toEqual([5_000, 20_000, 30_000, 40_000]);
    expect(v.dueThisWeek).toHaveLength(2); // overdue + the 25th
    expect(v.monthDueMillimes).toBe(55_000);
    expect(v.monthPaidMillimes).toBe(7_000);
    expect(v.paid).toHaveLength(1);
  });
});
