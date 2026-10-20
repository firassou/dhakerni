"use client";

import Link from "next/link";
import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { billsView, expiredBills, payBill, unpayBill, isBill } from "@/lib/bills/bills";
import { useBillCapture } from "@/lib/bills/useBillCapture";
import { useI18n } from "@/lib/i18n";
import { formatMillimes } from "@/lib/money";
import { spring } from "@/lib/motion";
import type { Task } from "@/lib/schemas";
import { useTasks } from "@/lib/tasks/useTasks";
import { formatDue } from "@/lib/time/format";
import { BillSheet } from "./BillSheet";
import { Brand } from "./Brand";
import { BackIcon, CheckIcon, PaperclipIcon } from "./Icon";
import { useUndoToast } from "./Toast";

/** "3 Jun" from a YYYY-MM-DD date. */
const shortDate = (date: string, locale: "ar" | "fr" | "en") => {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
};

const STAMP_MS = 1400;

/** A number that counts up to its new value, unless the person asked for less motion. */
function Money({ millimes }: { millimes: number }) {
  const { locale } = useI18n();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(millimes);
  const from = useRef(millimes);
  useEffect(() => {
    if (reduced || from.current === millimes) {
      from.current = millimes;
      const id = setTimeout(() => setShown(millimes), 0);
      return () => clearTimeout(id);
    }
    const controls = animate(from.current, millimes, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(Math.round(v)),
      onComplete: () => (from.current = millimes),
    });
    return () => controls.stop();
  }, [millimes, reduced]);
  return (
    <span className="tabular-nums" data-bidi>
      {formatMillimes(shown, locale)}
    </span>
  );
}

export function BillsScreen() {
  const { t, locale } = useI18n();
  const undoToast = useUndoToast();
  const { tasks, ready, insert, remove, upsert, getTasks } = useTasks();
  const capture = useBillCapture({ getTasks, insert, remove });
  const [now, setNow] = useState(() => new Date());
  const [stamped, setStamped] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Paid bills are kept for this month and the last; older ones go.
  useEffect(() => {
    if (!ready) return;
    for (const old of expiredBills(tasks, now)) remove(old.id);
  }, [ready, tasks, now, remove]);

  const view = useMemo(() => billsView(tasks, now), [tasks, now]);
  const weekIds = useMemo(() => new Set(view.dueThisWeek.map((x) => x.id)), [view.dueThisWeek]);
  const later = view.unpaid.filter((x) => !weekIds.has(x.id));

  const pay = useCallback(
    (task: Task) => {
      const { paid, next } = payBill(task, new Date());
      if (next) {
        upsert(next);
        insert([paid]);
      } else upsert(paid);
      setStamped((s) => new Set(s).add(paid.id));
      setTimeout(
        () =>
          setStamped((s) => {
            const n = new Set(s);
            n.delete(paid.id);
            return n;
          }),
        STAMP_MS,
      );
      undoToast(t("bills.paidToast", { provider: task.bill!.provider }), () => {
        if (next) {
          remove(paid.id);
          upsert(task);
        } else upsert(task);
      });
    },
    [insert, remove, t, undoToast, upsert],
  );

  const unpay = useCallback((task: Task) => upsert(unpayBill(task, new Date())), [upsert]);

  // A photo or a PDF pasted anywhere on this screen is read as a bill.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find(
        (f) => f.type.startsWith("image/") || f.type === "application/pdf",
      );
      if (file) {
        e.preventDefault();
        void capture.readFile(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [capture]);

  const row = (task: Task, paid: boolean) => (
    <BillRow
      key={task.id}
      task={task}
      now={now}
      paid={paid}
      stamp={stamped.has(task.id)}
      onPay={() => pay(task)}
      onUnpay={() => unpay(task)}
      locale={locale}
    />
  );

  const any = tasks.some(isBill);

  return (
    <div className="page-in mx-auto min-h-dvh w-full max-w-xl px-4 pt-[max(16px,env(safe-area-inset-top))] pb-16">
      <header className="flex items-center gap-1 py-3">
        <Link
          href="/"
          aria-label={t("nav.back")}
          className="text-ink-2 hover:bg-surface-2 grid size-11 place-items-center rounded-full"
        >
          <BackIcon />
        </Link>
        <h1 className="t-lead">{t("bills.title")}</h1>
        <Brand className="ms-auto" />
      </header>

      <main>
        <section
          aria-label={t("bills.summary")}
          className="rounded-group bg-surface mt-1 grid grid-cols-2 gap-px overflow-hidden"
        >
          <div className="px-4 py-3.5">
            <p className="t-micro text-ink-2">{t("bills.monthDue")}</p>
            <p className="t-lead mt-0.5" data-testid="month-due">
              <Money millimes={view.monthDueMillimes} />
            </p>
          </div>
          <div className="px-4 py-3.5">
            <p className="t-micro text-ink-2">{t("bills.monthPaid")}</p>
            <p className="t-lead mt-0.5" data-testid="month-paid">
              <Money millimes={view.monthPaidMillimes} />
            </p>
          </div>
        </section>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={capture.openPicker}
            className="bg-ink text-paper flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 font-medium transition-transform active:scale-95"
          >
            <PaperclipIcon className="size-5" />
            {t("bills.addFile")}
          </button>
          <button
            type="button"
            onClick={capture.openPaste}
            className="bg-surface text-ink flex-1 rounded-full px-4 py-3 font-medium transition-transform active:scale-95"
          >
            {t("bills.addText")}
          </button>
        </div>
        <p className="t-micro text-ink-2 mt-2">{t("bills.privacy")}</p>

        {ready && !any && (
          <div className="max-w-[30ch] py-14">
            <h2 className="t-title stagger">{t("bills.emptyTitle")}</h2>
            <p className="text-ink-2 stagger mt-2" style={{ "--d": 2 } as React.CSSProperties}>
              {t("bills.emptyBody")}
            </p>
          </div>
        )}

        <Section
          title={t("bills.dueWeek")}
          tasks={view.dueThisWeek}
          render={(x) => row(x, false)}
        />
        <Section title={t("bills.later")} tasks={later} render={(x) => row(x, false)} />
        <Section title={t("bills.paid")} tasks={view.paid} render={(x) => row(x, true)} />
      </main>

      <BillSheet capture={capture} />
    </div>
  );
}

function Section({
  title,
  tasks,
  render,
}: {
  title: string;
  tasks: Task[];
  render: (t: Task) => React.ReactNode;
}) {
  if (!tasks.length) return null;
  return (
    <section className="mt-7">
      <h2 className="t-small text-ink-2 mb-2 font-medium">{title}</h2>
      <ul className="rounded-group bg-surface overflow-hidden">
        <AnimatePresence initial={false}>{tasks.map(render)}</AnimatePresence>
      </ul>
    </section>
  );
}

function BillRow({
  task,
  now,
  paid,
  stamp,
  onPay,
  onUnpay,
  locale,
}: {
  task: Task;
  now: Date;
  paid: boolean;
  stamp: boolean;
  onPay: () => void;
  onUnpay: () => void;
  locale: "ar" | "fr" | "en";
}) {
  const { t } = useI18n();
  const bill = task.bill!;
  const overdue = !paid && task.dueAt !== null && Date.parse(task.dueAt) < now.getTime();
  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.16 } }}
      transition={spring.soft}
      className="border-ink/5 relative overflow-hidden border-b last:border-b-0"
      data-testid="bill-row"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" data-bidi>
            {bill.provider}
          </p>
          <p className="t-micro text-ink-2 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {paid ? (
              <span>{t("bills.paidOn", { when: formatDue(bill.paidAt!, locale, now, t) })}</span>
            ) : (
              task.dueAt && (
                <span
                  data-bidi
                  className={`rounded-full px-2 py-0.5 ${overdue ? "bg-danger/15 text-danger" : "bg-sun/25 text-ink"}`}
                >
                  {overdue ? `${t("time.overdue")} · ` : ""}
                  {formatDue(task.dueAt, locale, now, t)}
                </span>
              )
            )}
            {task.recurrence && !paid && <span>{t("bills.everyMonth")}</span>}
            {bill.periodFrom && bill.periodTo && (
              <span data-bidi>
                {t("bills.periodShort", {
                  from: shortDate(bill.periodFrom, locale),
                  to: shortDate(bill.periodTo, locale),
                })}
              </span>
            )}
            {bill.reference && (
              <span dir="ltr" className="tabular-nums">
                #{bill.reference}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="font-medium tabular-nums" data-bidi data-testid="bill-amount">
            {formatMillimes(bill.amountMillimes, locale)}
          </span>
          {paid ? (
            <button
              type="button"
              onClick={onUnpay}
              className="t-micro text-ink-2 hover:bg-surface-2 rounded-full px-2.5 py-1 active:scale-95"
            >
              {t("bills.unpay")}
            </button>
          ) : (
            <button
              type="button"
              onClick={onPay}
              className="t-small bg-brand-soft text-brand-text rounded-full px-3 py-1 font-medium active:scale-95"
            >
              {t("bills.pay")}
            </button>
          )}
        </div>
      </div>
      <AnimatePresence>
        {stamp && (
          <motion.span
            aria-hidden
            initial={{ opacity: 0, scale: 2.4, rotate: -24 }}
            animate={{ opacity: 1, scale: 1, rotate: -10 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={spring.bouncy}
            className="text-brand-text border-brand-text pointer-events-none absolute inset-y-2 start-1/2 flex items-center gap-1.5 rounded-lg border-2 px-3 text-lg font-bold tracking-widest uppercase"
          >
            <CheckIcon className="size-5" />
            {t("bills.stamp")}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
