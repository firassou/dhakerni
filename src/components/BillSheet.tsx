"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import { useState } from "react";
import type { BillDraft } from "@/lib/ai/bill-schema";
import { BILL_FILE_INPUT, type BillCapture } from "@/lib/bills/useBillCapture";
import { useI18n } from "@/lib/i18n";
import { formatMillimes, parseMillimes } from "@/lib/money";
import { spring } from "@/lib/motion";
import { CloseIcon } from "./Icon";

const field =
  "w-full rounded-field bg-surface-2 px-3 py-3 outline-none focus:ring-2 focus:ring-brand";

/** The whole bill-capture flow: pick a file, wait while it is read, check what was found, save. */
export function BillSheet({ capture }: { capture: BillCapture }) {
  const { t } = useI18n();
  const { stage, cancel } = capture;
  return (
    <>
      <input
        id={BILL_FILE_INPUT}
        type="file"
        accept="image/*,application/pdf"
        hidden
        data-testid="bill-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // the same photo can be picked again
          if (file) void capture.readFile(file);
        }}
      />
      <Dialog.Root open={stage.kind !== "idle"} onOpenChange={(open) => !open && cancel()}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay bg-ink/40 fixed inset-0 z-40" />
          <Dialog.Content
            aria-describedby={undefined}
            className="sheet bg-paper fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[28px] p-5 pb-[max(20px,env(safe-area-inset-bottom))] outline-none sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-[28px]"
          >
            <div className="flex items-center justify-between">
              <Dialog.Title className="t-lead">
                {stage.kind === "paste" ? t("bills.pasteTitle") : t("bills.reviewTitle")}
              </Dialog.Title>
              <Dialog.Close
                aria-label={t("editor.close")}
                className="text-ink-2 hover:bg-surface-2 grid size-11 place-items-center rounded-full"
              >
                <CloseIcon />
              </Dialog.Close>
            </div>

            {stage.kind === "paste" && <PasteStep onRead={(text) => void capture.readText(text)} />}
            {stage.kind === "reading" && <Reading />}
            {stage.kind === "error" && (
              <div role="alert" className="mt-4 space-y-4">
                <p>{stage.message}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => capture.fillByHand()}
                    className="bg-ink text-paper rounded-full px-5 py-2.5 font-medium active:scale-95"
                  >
                    {t("bills.byHand")}
                  </button>
                  <button
                    type="button"
                    onClick={cancel}
                    className="text-ink-2 hover:bg-surface-2 rounded-full px-5 py-2.5 active:scale-95"
                  >
                    {t("editor.close")}
                  </button>
                </div>
              </div>
            )}
            {stage.kind === "review" && (
              <Review draft={stage.draft} onSave={(bill) => capture.confirm(bill)} />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function PasteStep({ onRead }: { onRead: (text: string) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onRead(text);
      }}
    >
      <label className="block">
        <span className="sr-only">{t("bills.pasteTitle")}</span>
        <textarea
          data-bidi
          autoFocus
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("bills.pastePlaceholder")}
          className={`${field} resize-none`}
        />
      </label>
      <button
        type="submit"
        disabled={!text.trim()}
        className="bg-ink text-paper w-full rounded-full px-5 py-3 font-medium transition-opacity active:scale-[0.98] disabled:opacity-40"
      >
        {t("bills.read")}
      </button>
      <p className="t-micro text-ink-2">{t("bills.privacy")}</p>
    </form>
  );
}

function Reading() {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" className="mt-4 space-y-3" data-testid="bill-reading">
      <p className="text-ink-2">{t("bills.reading")}</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="shimmer rounded-field h-12" aria-hidden />
      ))}
    </div>
  );
}

function Review({
  draft,
  onSave,
}: {
  draft: BillDraft;
  onSave: (bill: {
    provider: string;
    amountMillimes: number;
    dueDate: string;
    reference: string | null;
    periodFrom: string | null;
    periodTo: string | null;
    monthly: boolean;
  }) => void;
}) {
  const { t, locale } = useI18n();
  const [provider, setProvider] = useState(draft.provider);
  const [amount, setAmount] = useState(
    draft.amountMillimes === null ? "" : (draft.amountMillimes / 1000).toFixed(3),
  );
  const [dueDate, setDueDate] = useState(draft.dueDate ?? "");
  const [reference, setReference] = useState(draft.reference ?? "");
  const [periodFrom, setPeriodFrom] = useState(draft.periodFrom ?? "");
  const [periodTo, setPeriodTo] = useState(draft.periodTo ?? "");
  const [monthly, setMonthly] = useState(false);

  const millimes = amount.trim() ? parseMillimes(amount) : null;
  const periodOk = !periodFrom || !periodTo || periodFrom <= periodTo;
  const valid = provider.trim() !== "" && millimes !== null && dueDate !== "" && periodOk;
  const unsure = (k: string) => draft.uncertain.includes(k);
  const ring = (k: string) => (unsure(k) ? "ring-2 ring-sun" : "");

  const hint = (k: string) =>
    unsure(k) ? <span className="t-micro text-sun-ink ms-2">{t("bills.check")}</span> : null;

  return (
    <motion.form
      className="mt-4 space-y-4"
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: 0.05 } } }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || millimes === null) return;
        onSave({
          provider: provider.trim(),
          amountMillimes: millimes,
          dueDate,
          reference: reference.trim() || null,
          periodFrom: periodFrom && periodTo ? periodFrom : null,
          periodTo: periodFrom && periodTo ? periodTo : null,
          monthly,
        });
      }}
    >
      {[
        <label key="p" className="block">
          <span className="t-small text-ink-2 mb-1 block">
            {t("bills.provider")}
            {hint("provider")}
          </span>
          <input
            data-bidi
            className={`${field} ${ring("provider")}`}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          />
        </label>,
        <label key="a" className="block">
          <span className="t-small text-ink-2 mb-1 block">
            {t("bills.amount")}
            {hint("amount")}
          </span>
          <input
            inputMode="decimal"
            dir="ltr"
            className={`${field} ${ring("amount")}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {millimes !== null && (
            <span className="t-small text-ink-2 mt-1 block" data-testid="bill-amount-preview">
              {formatMillimes(millimes, locale)}
            </span>
          )}
        </label>,
        <label key="d" className="block">
          <span className="t-small text-ink-2 mb-1 block">
            {t("bills.dueDate")}
            {hint("dueDate")}
          </span>
          <input
            type="date"

            className={`${field} ${ring("dueDate")}`}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>,
        <label key="r" className="block">
          <span className="t-small text-ink-2 mb-1 block">
            {t("bills.reference")}
            {hint("reference")}
          </span>
          <input
            data-bidi
            dir="ltr"
            className={field}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>,
        <fieldset key="period">
          <legend className="t-small text-ink-2 mb-1">{t("bills.period")}</legend>
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label={t("bills.periodFrom")}
              className={field}
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
            />
            <span aria-hidden className="text-ink-2">
              →
            </span>
            <input
              type="date"
              aria-label={t("bills.periodTo")}
              className={field}
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
            />
          </div>
        </fieldset>,
        <label key="m" className="flex items-center gap-3 py-1">
          <input
            type="checkbox"
            checked={monthly}
            onChange={(e) => setMonthly(e.target.checked)}
            className="accent-brand size-5"
          />
          <span>{t("bills.monthly")}</span>
        </label>,
      ].map((row) => (
        <motion.div
          key={row.key}
          variants={{ hidden: { opacity: 0, y: 10 }, shown: { opacity: 1, y: 0 } }}
          transition={spring.soft}
        >
          {row}
        </motion.div>
      ))}
      <button
        type="submit"
        disabled={!valid}
        className="bg-ink text-paper w-full rounded-full px-5 py-3.5 font-medium transition-[opacity,transform] active:scale-[0.98] disabled:opacity-40"
      >
        {t("bills.save")}
      </button>
      <p className="t-micro text-ink-2">{t("bills.remindNote")}</p>
    </motion.form>
  );
}
