"use client";

import { useI18n } from "@/lib/i18n";
import type { Template } from "@/lib/memory/learning";

/** Tasks the person adds again and again, one tap away, with the checklist they had last time. */
export function QuickAdd({
  templates,
  onAdd,
}: {
  templates: Template[];
  onAdd: (template: Template) => void;
}) {
  const { t } = useI18n();
  if (!templates.length) return null;
  return (
    <div role="group" aria-label={t("quick.label")} className="mb-3 flex flex-wrap gap-2">
      {templates.map((tpl) => (
        <button
          key={tpl.title}
          onClick={() => onAdd(tpl)}
          aria-label={t("quick.add", { title: tpl.title })}
          className="t-small border-ink/15 hover:border-door bg-surface rounded-full border px-3.5 py-2 font-medium transition-transform duration-[var(--t-fast)] ease-[var(--ease-spring)] active:scale-95"
        >
          <span aria-hidden className="text-ink-2 me-1">
            +
          </span>
          <span data-bidi>{tpl.title}</span>
        </button>
      ))}
    </div>
  );
}
