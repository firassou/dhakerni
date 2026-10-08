"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { PushState } from "@/lib/push/support";
import { BellIcon } from "./Icon";

const KEY = "dhakerni.pushBannerDismissed";
const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** Offers notifications once there is a reminder worth delivering. Easy to dismiss, never repeated. */
export function PushBanner({
  state,
  hasReminders,
  onEnable,
}: {
  state: PushState;
  hasReminders: boolean;
  onEnable: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(read);
  if (state !== "default" || !hasReminders || dismissed) return null;

  return (
    <div className="alert-in rounded-card bg-door-soft mb-3 flex items-center gap-3 p-3">
      <BellIcon className="text-door size-5 shrink-0" />
      <p className="t-small flex-1">{t("push.banner")}</p>
      <button
        onClick={() => void onEnable()}
        className="t-small bg-door text-door-ink rounded-full px-4 py-2 font-medium active:scale-95"
      >
        {t("push.bannerAction")}
      </button>
      <button
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            /* fine: it just shows again next visit */
          }
        }}
        className="t-small text-ink-2 hover:bg-ink/10 rounded-full px-3 py-2"
      >
        {t("push.bannerDismiss")}
      </button>
    </div>
  );
}
