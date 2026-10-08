"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSessionId } from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import { Dock } from "./Dock";
import { FilterTabs, type Filter } from "./FilterTabs";
import { Mark, SlidersIcon } from "./Icon";

export function HomeScreen() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>("today");

  // Creates the anonymous session id on first launch.
  useEffect(() => {
    getSessionId().catch(() => {});
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-[max(16px,env(safe-area-inset-top))] pb-40">
      <header className="flex items-center justify-between py-3">
        <div className="text-door flex items-center gap-2">
          <Mark className="size-8" />
          <h1 className="t-lead text-ink">{t("app.name")}</h1>
        </div>
        <Link
          href="/settings"
          aria-label={t("nav.settings")}
          className="text-ink-2 hover:bg-surface-2 grid size-11 place-items-center rounded-full transition-colors"
        >
          <SlidersIcon />
        </Link>
      </header>

      <FilterTabs value={filter} onChange={setFilter} />

      <main className="flex flex-1 flex-col justify-center py-16" aria-live="polite">
        <div key={filter} className="rise max-w-[28ch]">
          <h2 className="t-title">{t(`empty.${filter}.title`)}</h2>
          <p className="text-ink-2 mt-2">{t(`empty.${filter}.body`)}</p>
        </div>
      </main>

      <Dock />
    </div>
  );
}
