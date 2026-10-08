"use client";

import { useI18n } from "@/lib/i18n";

export const FILTERS = ["today", "upcoming", "needsTime", "all", "done"] as const;
export type Filter = (typeof FILTERS)[number];

export function FilterTabs({ value, onChange }: { value: Filter; onChange: (f: Filter) => void }) {
  const { t } = useI18n();
  return (
    <div
      role="tablist"
      aria-label={t("filters.label")}
      className="-mx-4 flex [scrollbar-width:none] gap-1 overflow-x-auto px-4 pb-1"
    >
      {FILTERS.map((f) => {
        const active = f === value;
        return (
          <button
            key={f}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(f)}
            className={`t-small shrink-0 rounded-full px-4 py-2 font-medium transition-colors duration-[var(--t-fast)] ${
              active ? "bg-ink text-paper" : "text-ink-2 hover:bg-surface-2"
            }`}
          >
            {t(`filters.${f}`)}
          </button>
        );
      })}
    </div>
  );
}
