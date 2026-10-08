"use client";

import * as Switch from "@radix-ui/react-switch";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { isLearningOn, setLearning } from "@/lib/memory/profile";

/** The one switch that stops all learning. Existing facts stay until deleted. */
export function LearningSwitch() {
  const { t } = useI18n();
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    let current = true; // ignore a stale read (see PrayerSettings)
    isLearningOn()
      .then((v) => current && setOn(v))
      .catch(() => current && setOn(true));
    return () => {
      current = false;
    };
  }, []);

  if (on === null) return <div className="h-16" />;
  return (
    <div className="rounded-card bg-surface flex items-start gap-4 p-4">
      <div className="flex-1">
        <label htmlFor="learning-switch" className="font-medium">
          {t("memory.learning.title")}
        </label>
        <p className="t-small text-ink-2 mt-1" aria-live="polite">
          {on ? t("memory.learning.on") : t("memory.learning.off")}
        </p>
      </div>
      <Switch.Root
        id="learning-switch"
        checked={on}
        onCheckedChange={(next) => {
          setOn(next);
          void setLearning(next);
        }}
        className="bg-ink-2/40 data-[state=checked]:bg-door relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors duration-[var(--t-base)]"
      >
        <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-[var(--t-base)] ease-[var(--ease-spring)] data-[state=checked]:translate-x-[22px] rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-[22px]" />
      </Switch.Root>
    </div>
  );
}
