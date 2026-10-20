"use client";

import { useI18n } from "@/lib/i18n";
import { useOnline } from "@/lib/net/useOnline";

/** Shown only while the network is unusable: says what still works, so offline never feels broken. */
export function OfflinePill() {
  const { t } = useI18n();
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      data-testid="offline-pill"
      className="bg-surface-2 text-ink-2 t-small mb-2 flex items-start gap-2 rounded-2xl px-4 py-3"
    >
      <span aria-hidden className="bg-danger mt-1.5 size-2 shrink-0 rounded-full" />
      <span>
        <strong className="text-ink font-medium">{t("offline.title")}</strong>
        {" · "}
        {t("offline.body")}
      </span>
    </div>
  );
}
