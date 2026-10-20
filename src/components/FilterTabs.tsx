"use client";

import { motion } from "motion/react";
import { useI18n } from "@/lib/i18n";
import { spring } from "@/lib/motion";

import { FILTERS, type Filter } from "@/lib/tasks/filters";

export { FILTERS };
export type { Filter };

/** An iOS segmented control: a grey track with a white thumb that slides to the chosen segment. */
export function FilterTabs({ value, onChange }: { value: Filter; onChange: (f: Filter) => void }) {
  const { t } = useI18n();
  return (
    <div className="[scrollbar-width:none] overflow-x-auto pb-1">
      <div
        role="tablist"
        aria-label={t("filters.label")}
        className="bg-fill flex min-w-max gap-0.5 rounded-[10px] p-0.5"
      >
        {FILTERS.map((f) => {
          const active = f === value;
          return (
            <button
              key={f}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(f)}
              className={`t-small relative flex-1 shrink-0 rounded-[8px] px-2 py-1.5 font-medium whitespace-nowrap transition-colors duration-[var(--t-fast)] ${
                active ? "text-ink" : "text-ink-2"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="filter-thumb"
                  transition={spring.soft}
                  className="bg-thumb absolute inset-0 rounded-[8px] shadow-[0_3px_8px_rgb(0_0_0/0.12),0_0.5px_1px_rgb(0_0_0/0.18)]"
                />
              )}
              <span className="relative">{t(`filters.${f}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
