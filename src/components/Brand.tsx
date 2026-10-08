"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { Mark } from "./Icon";

/** The app's name and icon, always a way back to the home screen. */
export function Brand({ onClick, className = "" }: { onClick?: () => void; className?: string }) {
  const { t } = useI18n();
  return (
    <Link
      href="/"
      onClick={onClick}
      aria-label={`${t("app.name")}: ${t("nav.home")}`}
      className={`hover:bg-surface-2 -mx-2 flex items-center gap-2.5 rounded-full px-2 py-1 transition-colors active:scale-[0.98] ${className}`}
    >
      <Mark className="size-8" />
      <span className="t-lead text-ink">{t("app.name")}</span>
    </Link>
  );
}
