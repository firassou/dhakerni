"use client";

import * as Switch from "@radix-ui/react-switch";
import { useEffect, useState } from "react";
import { getMeta, setMeta } from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import { DIGEST_HOUR } from "@/lib/reminders/engine";

/** One notification each evening saying what tomorrow holds. Off until the person asks for it. */
export function DigestSwitch() {
  const { t } = useI18n();
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    let current = true; // ignore a stale read (see PrayerSettings)
    getMeta<boolean>("digest")
      .then((v) => current && setOn(v === true))
      .catch(() => current && setOn(false));
    return () => {
      current = false;
    };
  }, []);

  if (on === null) return <div className="h-16" />;
  return (
    <div className="rounded-card bg-surface mt-2 flex items-start gap-4 p-4">
      <div className="flex-1">
        <label htmlFor="digest-switch" className="font-medium">
          {t("digest.title")}
        </label>
        <p className="t-small text-ink-2 mt-1">{t("digest.help", { hour: DIGEST_HOUR })}</p>
      </div>
      <Switch.Root
        id="digest-switch"
        checked={on}
        onCheckedChange={(next) => {
          setOn(next);
          void setMeta("digest", next);
        }}
        className="bg-ink-2/40 data-[state=checked]:bg-door relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors duration-[var(--t-base)]"
      >
        <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-[var(--t-base)] ease-[var(--ease-spring)] data-[state=checked]:translate-x-[22px] rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-[22px]" />
      </Switch.Root>
    </div>
  );
}
