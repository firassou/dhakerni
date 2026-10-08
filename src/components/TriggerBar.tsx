"use client";

import { useI18n } from "@/lib/i18n";

/** One-tap manual triggers for tasks waiting on an event ("after I leave work"). No location tracking. */
export function TriggerBar({
  anchors,
  onTrigger,
}: {
  anchors: string[];
  onTrigger: (anchor: string) => void;
}) {
  const { t } = useI18n();
  if (!anchors.length) return null;
  return (
    <div role="group" aria-label={t("trigger.label")} className="mb-3 flex flex-wrap gap-2">
      {anchors.map((a) => {
        const label = t(`trigger.${a}`);
        return (
          <button
            key={a}
            onClick={() => onTrigger(a)}
            className="t-small bg-door-soft text-door hover:bg-door/20 rounded-full px-4 py-2 font-medium transition-transform duration-[var(--t-fast)] ease-[var(--ease-spring)] active:scale-95"
          >
            {label === `trigger.${a}` ? a : label}
          </button>
        );
      })}
    </div>
  );
}
