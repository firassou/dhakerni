"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { PushState } from "@/lib/push/support";
import { BellIcon } from "./Icon";

const KEY = "dhakerni.pushBannerDismissed";
const ASKED_KEY = "dhakerni.pushAsked";
const read = (key: string) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const remember = (key: string) => {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* fine: it just happens again next visit */
  }
};

/**
 * Asks for notifications from the very first visit: the browser's own permission prompt opens as soon as
 * the intro is over, once. Browsers that only prompt after a tap (Safari, Firefox) ignore that, so the
 * banner is there from the start too. Easy to dismiss, never repeated.
 */
export function PushBanner({
  state,
  onEnable,
}: {
  state: PushState;
  onEnable: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(() => read(KEY));

  useEffect(() => {
    if (state !== "default" || read(ASKED_KEY)) return;
    const ask = () => {
      if (document.documentElement.dataset.intro === "on") return; // not over the opening animation
      clearInterval(id);
      remember(ASKED_KEY);
      onEnable().catch(() => {}); // refused without a tap: the banner below does it
    };
    const id = setInterval(ask, 300);
    return () => clearInterval(id);
  }, [state, onEnable]);

  if (state !== "default" || dismissed) return null;

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
          remember(KEY);
        }}
        className="t-small text-ink-2 hover:bg-ink/10 rounded-full px-3 py-2"
      >
        {t("push.bannerDismiss")}
      </button>
    </div>
  );
}
