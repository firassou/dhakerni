"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { usePush } from "@/lib/push/usePush";
import { isFirefox } from "@/lib/push/support";
import { useToast } from "./Toast";

const btn =
  "t-small rounded-full px-4 py-2 font-medium transition-transform duration-[var(--t-fast)] active:scale-95";

/** Notification status and controls for the Settings screen. */
export function PushControls() {
  const { t } = useI18n();
  const { show } = useToast();
  const { state, enable, disable } = usePush();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      console.error("push action failed", e);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(t("notify.test"), {
      body: t("notify.testBody"),
      tag: "dhakerni-test",
      icon: "/icons/icon-192.png",
    });
    show({ message: t("push.testSent") });
  }

  const status = {
    loading: "",
    enabled: t("push.status.enabled"),
    default: t("push.status.default"),
    denied: t("push.status.denied"),
    unsupported: t("push.status.unsupported"),
    "server-off": t("push.status.serverOff"),
    "ios-install": t("push.status.iosInstall"),
  }[state];

  return (
    <div className="rounded-card bg-surface space-y-3 p-4">
      <p aria-live="polite">{status}</p>

      {state === "ios-install" && (
        <div className="rounded-field bg-surface-2 p-3">
          <p className="mb-1 font-medium">{t("push.ios.title")}</p>
          <ol className="text-ink-2 list-decimal space-y-1 ps-5">
            <li>{t("push.ios.step1")}</li>
            <li>{t("push.ios.step2")}</li>
            <li>{t("push.ios.step3")}</li>
          </ol>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {state === "default" && (
          <button
            disabled={busy}
            onClick={() => run(enable)}
            className={`${btn} bg-door text-door-ink`}
          >
            {t("push.enable")}
          </button>
        )}
        {state === "enabled" && (
          <>
            <button disabled={busy} onClick={() => run(test)} className={`${btn} bg-surface-2`}>
              {t("push.test")}
            </button>
            <button
              disabled={busy}
              onClick={() => run(disable)}
              className={`${btn} text-ink-2 hover:bg-surface-2`}
            >
              {t("push.disable")}
            </button>
          </>
        )}
      </div>

      {state === "enabled" && typeof navigator !== "undefined" && isFirefox() && (
        <p className="t-micro text-ink-2">{t("push.firefox")}</p>
      )}
    </div>
  );
}
