"use client";

import { useState } from "react";
import { getDB } from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import { usePush } from "@/lib/push/usePush";

/** Wipes this device: tasks, everything learned, settings, and the server's copy of the reminders. */
export function ResetControls() {
  const { t } = useI18n();
  const { disable } = usePush();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reset() {
    setBusy(true);
    try {
      // First, while the anonymous id still exists: have the server forget the subscription and reminders.
      await disable().catch((e) => console.error("push reset failed", e));
      const db = await getDB();
      await Promise.all([db.clear("tasks"), db.clear("profile"), db.clear("meta")]);
      try {
        localStorage.clear();
      } catch {
        /* storage blocked: nothing was kept there */
      }
    } catch (e) {
      console.error("reset failed", e);
    }
    // Every screen holds its own copy of the data: start again from the front door.
    location.replace("/");
  }

  if (!confirming)
    return (
      <button
        onClick={() => setConfirming(true)}
        className="t-small rounded-field text-danger hover:bg-danger/10 w-full py-3 font-medium"
      >
        {t("settings.reset.action")}
      </button>
    );

  return (
    <div
      role="alertdialog"
      aria-label={t("settings.reset.action")}
      className="rounded-card bg-danger/10 space-y-3 p-4"
    >
      <p>{t("settings.reset.confirm")}</p>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy}
          onClick={() => void reset()}
          className="t-small bg-danger rounded-full px-4 py-2 font-medium text-white active:scale-95 disabled:opacity-60"
        >
          {t("settings.reset.yes")}
        </button>
        <button
          disabled={busy}
          onClick={() => setConfirming(false)}
          className="t-small text-ink-2 hover:bg-surface-2 rounded-full px-4 py-2"
        >
          {t("settings.reset.cancel")}
        </button>
      </div>
    </div>
  );
}
