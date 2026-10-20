"use client";

import { motion } from "motion/react";
import { useI18n } from "@/lib/i18n";
import { spring } from "@/lib/motion";

import { FILTERS, type Filter } from "@/lib/tasks/filters";

export { FILTERS };
export type { Filter };

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
            className={`t-small relative shrink-0 rounded-full px-4 py-2 font-medium transition-colors duration-[var(--t-fast)] active:scale-95 ${
              active ? "text-paper" : "text-ink-2 hover:bg-surface-2"
            }`}
          >
            {/* One pill that glides between tabs instead of jumping. */}
            {active && (
              <motion.span
                layoutId="filter-pill"
                transition={spring.soft}
                className="bg-ink absolute inset-0 rounded-full"
              />
            )}
            <span className="relative">{t(`filters.${f}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
