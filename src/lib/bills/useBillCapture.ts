"use client";

import { useCallback, useRef, useState } from "react";
import { useToast, useUndoToast } from "@/components/Toast";
import { ApiError, readBill } from "@/lib/ai/client";
import type { BillDraft } from "@/lib/ai/bill-schema";
import { useI18n } from "@/lib/i18n";
import type { Task } from "@/lib/schemas";
import { billTask, type BillInput } from "./bills";
import { prepareBillFile, UnreadableFile } from "./prepare";

export type BillStage =
  | { kind: "idle" }
  | { kind: "paste" }
  | { kind: "reading" }
  | { kind: "review"; draft: BillDraft }
  | { kind: "error"; message: string };

export const BILL_FILE_INPUT = "bill-file-input";

const BLANK: BillDraft = {
  provider: "",
  amountMillimes: null,
  dueDate: null,
  reference: null,
  periodFrom: null,
  periodTo: null,
  uncertain: ["provider", "amount", "dueDate"],
};

interface Deps {
  getTasks: () => Task[];
  insert: (tasks: Task[]) => void;
  remove: (id: string) => void;
}

/**
 * A bill from a photo, PDF or pasted text: read by the AI, shown for a check, then saved as a task that
 * reminds before it is due. The photo itself lives only in memory while it is read.
 */
export function useBillCapture({ getTasks, insert, remove }: Deps) {
  const { t } = useI18n();
  const { show } = useToast();
  const undoToast = useUndoToast();
  const [stage, setStage] = useState<BillStage>({ kind: "idle" });
  const run = useRef(0); // closing the sheet makes a read still in flight stale

  const fail = useCallback(
    (e: unknown) => {
      const key =
        e instanceof ApiError
          ? e.kind === "network"
            ? "bills.errNetwork"
            : e.kind === "rate_limited"
              ? "bills.errRateLimited"
              : e.kind === "too_large"
                ? "bills.errTooLarge"
                : "bills.errRead"
          : e instanceof UnreadableFile
            ? e.message === "too_large"
              ? "bills.errTooLarge"
              : "bills.errFile"
            : "bills.errRead";
      setStage({ kind: "error", message: t(key) });
    },
    [t],
  );

  const readFile = useCallback(
    async (file: File | Blob) => {
      const mine = ++run.current;
      setStage({ kind: "reading" });
      try {
        const draft = await readBill({ file: await prepareBillFile(file) });
        if (mine === run.current) setStage({ kind: "review", draft });
      } catch (e) {
        if (mine === run.current) fail(e);
      }
    },
    [fail],
  );

  const readText = useCallback(
    async (text: string) => {
      const mine = ++run.current;
      setStage({ kind: "reading" });
      try {
        const draft = await readBill({ text });
        if (mine === run.current) setStage({ kind: "review", draft });
      } catch (e) {
        if (mine === run.current) fail(e);
      }
    },
    [fail],
  );

  const cancel = useCallback(() => {
    run.current++;
    setStage({ kind: "idle" });
  }, []);

  const confirm = useCallback(
    (bill: BillInput) => {
      const task = billTask(bill, getTasks(), new Date());
      insert([task]);
      setStage({ kind: "idle" });
      undoToast(t("bills.added", { provider: bill.provider }), () => remove(task.id));
      return task;
    },
    [getTasks, insert, remove, undoToast, t],
  );

  return {
    stage,
    /** Opens the file chooser of the hidden input that BillSheet renders. */
    openPicker: () => document.getElementById(BILL_FILE_INPUT)?.click(),
    openPaste: () => setStage({ kind: "paste" }),
    fillByHand: () => setStage({ kind: "review", draft: BLANK }),
    readFile,
    readText,
    cancel,
    confirm,
    notify: show,
  };
}
export type BillCapture = ReturnType<typeof useBillCapture>;
