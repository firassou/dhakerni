"use client";

import { useI18n } from "@/lib/i18n";
import { useInstall } from "@/lib/install";

/** Shown only while the browser offers to install the app; gone once it is installed. */
export function InstallButton({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const { canInstall, install } = useInstall();
  if (!canInstall) return null;
  return (
    <button
      onClick={() => void install()}
      className={`t-small bg-door text-door-ink rounded-full px-4 py-2 font-medium transition-transform duration-[var(--t-fast)] active:scale-95 ${className}`}
    >
      {t("install.action")}
    </button>
  );
}
