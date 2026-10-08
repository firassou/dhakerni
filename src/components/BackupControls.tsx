"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState } from "react";
import { exportBackup, importBackup, parseBackup, type ParseResult } from "@/lib/backup";
import { useI18n } from "@/lib/i18n";
import { useToast } from "./Toast";

const btn =
  "t-small rounded-full px-4 py-2 font-medium transition-transform duration-[var(--t-fast)] active:scale-95";

/** Export everything to a JSON file, or import one (merge or replace). */
export function BackupControls() {
  const { t } = useI18n();
  const { show } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    name: string;
    parsed: Extract<ParseResult, { ok: true }>;
  } | null>(null);

  async function doExport() {
    const backup = await exportBackup(process.env.NEXT_PUBLIC_APP_VERSION ?? "");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `dhakerni-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    show({ message: t("backup.exported") });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) return show({ message: t(`backup.errors.${parsed.error}`) });
    setPending({ name: file.name, parsed });
  }

  async function doImport(mode: "merge" | "replace") {
    if (!pending) return;
    const report = await importBackup(pending.parsed, mode);
    setPending(null);
    show({
      message:
        t("backup.done", { tasks: report.tasks, facts: report.facts }) +
        (report.skipped ? ` ${t("backup.skipped", { n: report.skipped })}` : ""),
    });
    // Other screens hold their own copies of the data: start fresh so nothing shows stale.
    setTimeout(() => location.reload(), 1200);
  }

  return (
    <div className="rounded-card bg-surface space-y-3 p-4">
      <p className="text-ink-2">{t("backup.body")}</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void doExport()} className={`${btn} bg-surface-2`}>
          {t("backup.export")}
        </button>
        <button onClick={() => input.current?.click()} className={`${btn} bg-surface-2`}>
          {t("backup.import")}
        </button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label={t("backup.import")}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <Dialog.Root open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay bg-ink/40 fixed inset-0 z-40" />
          <Dialog.Content
            aria-describedby={undefined}
            className="sheet bg-paper fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-xl rounded-t-[28px] p-5 pb-[max(20px,env(safe-area-inset-bottom))] outline-none sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-[28px]"
          >
            <Dialog.Title className="t-lead" data-bidi>
              {t("backup.choose", { name: pending?.name ?? "" })}
            </Dialog.Title>
            <div className="mt-4 space-y-2">
              <button
                onClick={() => void doImport("merge")}
                className="rounded-field bg-surface w-full p-4 text-start"
              >
                <span className="block font-medium">{t("backup.merge")}</span>
                <span className="t-small text-ink-2">{t("backup.mergeHelp")}</span>
              </button>
              <button
                onClick={() => void doImport("replace")}
                className="rounded-field bg-surface w-full p-4 text-start"
              >
                <span className="text-danger block font-medium">{t("backup.replace")}</span>
                <span className="t-small text-ink-2">{t("backup.replaceHelp")}</span>
              </button>
              <Dialog.Close className="t-small rounded-field text-ink-2 hover:bg-surface-2 w-full py-3">
                {t("backup.cancel")}
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
