"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  exactAlarmsAllowed,
  openExactAlarmSetting,
  scheduleNativeTest,
} from "@/lib/native/reminders";
import { scheduleTestReminder, usePush } from "@/lib/push/usePush";
import { isAndroid, isFirefox } from "@/lib/push/support";
import { useToast } from "./Toast";

const btn =
  "t-small rounded-full px-4 py-2 font-medium transition-transform duration-[var(--t-fast)] active:scale-95";

/** Notification status and controls for the Settings screen. */
export function PushControls() {
  const { t } = useI18n();
  const { show } = useToast();
  const { state, background, enable, disable } = usePush();
  const [busy, setBusy] = useState(false);
  /** Android app only: false when Android may hold reminders back instead of ringing on the minute. */
  const [exact, setExact] = useState(true);
  useEffect(() => {
    if (state !== "native") return;
    const check = () => void exactAlarmsAllowed().then(setExact);
    check();
    // The person comes back from Android's settings screen: look again.
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [state]);

  async function nativeTest() {
    await scheduleNativeTest(t("notify.test"), {
      channel: t("native.channel"),
      body: t("notify.testBody"),
      done: t("notify.done"),
      snooze: t("notify.snooze", { n: 10 }),
    });
    show({ message: t("native.testSent") });
  }

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
    // And one through the whole real path, a minute from now: the only test that proves reminders arrive
    // with the app closed.
    const booked = await scheduleTestReminder(t("notify.test")).catch(() => false);
    show({ message: t(booked ? "push.testSent" : "push.testLocalOnly") });
  }

  const status = {
    loading: "",
    enabled: t("push.status.enabled"),
    default: t("push.status.default"),
    denied: t("push.status.denied"),
    unsupported: t("push.status.unsupported"),
    "server-off": t("push.status.serverOff"),
    "ios-install": t("push.status.iosInstall"),
    native: t("native.status.on"),
    "native-denied": t("native.status.denied"),
  }[state];

  return (
    <div className="rounded-card bg-surface space-y-3 p-4">
      <p aria-live="polite">{status}</p>
      {state === "enabled" && background === "stalled" && (
        <p role="alert" className="rounded-field bg-danger/10 text-danger p-3 font-medium">
          {t("push.stalled")}
        </p>
      )}

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
        {state === "native" && (
          <button disabled={busy} onClick={() => run(nativeTest)} className={`${btn} bg-surface-2`}>
            {t("push.test")}
          </button>
        )}
        {state === "native" && !exact && (
          <button
            onClick={() => void openExactAlarmSetting()}
            className={`${btn} bg-door text-door-ink`}
          >
            {t("native.allowExact")}
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

      {state === "native" && !exact && (
        <p role="alert" className="rounded-field bg-danger/10 text-danger p-3 font-medium">
          {t("native.exactOff")}
        </p>
      )}
      {state === "native" && <p className="t-micro text-ink-2">{t("native.battery")}</p>}
      {state === "enabled" && typeof navigator !== "undefined" && (
        <p className="t-micro text-ink-2">{t("push.repeats")}</p>
      )}
      {/* A sleeping phone may hold notifications back from a battery-restricted browser. */}
      {state === "enabled" && typeof navigator !== "undefined" && isAndroid() && (
        <p className="t-micro text-ink-2">{t("push.android")}</p>
      )}
      {state === "enabled" && typeof navigator !== "undefined" && isFirefox() && (
        <p className="t-micro text-ink-2">{t("push.firefox")}</p>
      )}
    </div>
  );
}
