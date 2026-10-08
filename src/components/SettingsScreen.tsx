"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSessionId } from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import { LOCALES } from "@/lib/i18n/locales";
import { Brand } from "./Brand";
import { BackIcon } from "./Icon";
import { BackupControls } from "./BackupControls";
import { LearningSwitch } from "./LearningSwitch";
import { PrayerSettings } from "./PrayerSettings";
import { PushControls } from "./PushControls";
import { ResetControls } from "./ResetControls";

export function SettingsScreen() {
  const { t, preference, setPreference } = useI18n();
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    getSessionId()
      .then(setSessionId)
      .catch(() => {});
  }, []);

  const options = ["system", ...LOCALES] as const;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl px-4 pt-[max(16px,env(safe-area-inset-top))] pb-16">
      <header className="flex items-center gap-1 py-3">
        <Link
          href="/"
          aria-label={t("nav.back")}
          className="text-ink-2 hover:bg-surface-2 grid size-11 place-items-center rounded-full"
        >
          <BackIcon />
        </Link>
        <h1 className="t-lead">{t("settings.title")}</h1>
        <Brand className="ms-auto" />
      </header>

      <section aria-labelledby="lang-h" className="mt-6">
        <h2 id="lang-h" className="t-small text-ink-2 mb-2 font-medium">
          {t("settings.language.title")}
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="lang-h"
          className="rounded-card bg-surface overflow-hidden"
        >
          {options.map((o) => {
            const active = preference === o;
            return (
              <button
                key={o}
                role="radio"
                aria-checked={active}
                onClick={() => setPreference(o)}
                className="border-line hover:bg-surface-2 flex w-full items-center justify-between border-b px-4 py-3.5 text-start last:border-b-0"
              >
                <span data-bidi>{t(`settings.language.${o}`)}</span>
                <span
                  aria-hidden
                  className={`size-5 rounded-full border-2 transition-all duration-[var(--t-base)] ease-[var(--ease-spring)] ${
                    active
                      ? "border-door bg-door shadow-[inset_0_0_0_4px_var(--surface)]"
                      : "border-line"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="push-h" className="mt-10">
        <h2 id="push-h" className="t-small text-ink-2 mb-2 font-medium">
          {t("push.title")}
        </h2>
        <PushControls />
      </section>

      <section id="prayer" aria-labelledby="prayer-h" className="mt-10">
        <h2 id="prayer-h" className="t-small text-ink-2 mb-2 font-medium">
          {t("settings.prayer.title")}
        </h2>
        <PrayerSettings />
      </section>

      <section aria-labelledby="learn-h" className="mt-10 space-y-2">
        <h2 id="learn-h" className="t-small text-ink-2 font-medium">
          {t("settings.learning")}
        </h2>
        <LearningSwitch />
        <Link
          href="/memory"
          className="rounded-card bg-surface hover:bg-surface-2 flex items-center justify-between p-4 font-medium"
        >
          {t("memory.link")}
          <span aria-hidden className="text-ink-2 rtl:-scale-x-100">
            ›
          </span>
        </Link>
      </section>

      <section aria-labelledby="backup-h" className="mt-10">
        <h2 id="backup-h" className="t-small text-ink-2 mb-2 font-medium">
          {t("backup.title")}
        </h2>
        <BackupControls />
      </section>

      <section aria-labelledby="priv-h" className="mt-10">
        <h2 id="priv-h" className="t-small text-ink-2 mb-2 font-medium">
          {t("settings.privacy.title")}
        </h2>
        <div className="rounded-card bg-surface space-y-3 p-4">
          <p>{t("settings.privacy.local")}</p>
          <p className="text-ink-2">{t("settings.privacy.server")}</p>
          <p className="t-micro text-ink-2">
            {t("settings.anonymousId")}:{" "}
            <span dir="ltr" className="font-mono">
              {sessionId.slice(0, 8)}
            </span>
          </p>
        </div>
      </section>

      <section aria-labelledby="reset-h" className="mt-10">
        <h2 id="reset-h" className="t-small text-ink-2 mb-2 font-medium">
          {t("settings.reset.title")}
        </h2>
        <ResetControls />
      </section>

      <footer className="text-ink-2 mt-12 space-y-1 text-center">
        <p data-bidi>{t("settings.madeBy")}</p>
        <p className="t-micro">
          {t("settings.version")} <span dir="ltr">{process.env.NEXT_PUBLIC_APP_VERSION}</span>
        </p>
      </footer>
    </div>
  );
}
