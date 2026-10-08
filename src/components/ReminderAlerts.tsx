"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { Task } from "@/lib/schemas";
import { BellIcon } from "./Icon";

interface Props {
  alerts: Task[];
  snoozeMinutes: number;
  onDone: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
  onOpen: (id: string) => void;
}

/** Due reminders, pinned above the list until you act on them. */
export function ReminderAlerts({ alerts, snoozeMinutes, onDone, onSnooze, onOpen }: Props) {
  const { t } = useI18n();
  if (!alerts.length) return null;
  return (
    <section aria-label={t("reminders.label")} aria-live="assertive" className="mb-3 space-y-2">
      {alerts.map((task) => (
        <div key={task.id} className="alert-in rounded-card bg-sun/30 ring-sun/60 p-3 ring-1">
          <p data-bidi className="flex items-start gap-2 font-medium">
            <BellIcon className="mt-0.5 size-5 shrink-0" />
            {task.title}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2 ps-7">
            <button
              onClick={() => onDone(task.id)}
              className="t-small bg-ink text-paper rounded-full px-4 py-2 font-medium active:scale-95"
            >
              {t("reminders.done")}
            </button>
            <SnoozeControl onSnooze={(m) => onSnooze(task.id, m)} defaultMinutes={snoozeMinutes} />
            <button
              onClick={() => onOpen(task.id)}
              className="t-small text-ink-2 hover:bg-ink/10 rounded-full px-4 py-2 font-medium"
            >
              {t("reminders.open")}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

const CHOICES = [5, 10, 15, 30, 60];

/** Snooze button with a length. Choosing the same length again and again becomes the new default. */
function SnoozeControl({
  defaultMinutes,
  onSnooze,
}: {
  defaultMinutes: number;
  onSnooze: (minutes: number) => void;
}) {
  const { t } = useI18n();
  const options = [...new Set([...CHOICES, defaultMinutes])].sort((a, b) => a - b);
  const [minutes, setMinutes] = useState(defaultMinutes);
  return (
    <span className="bg-surface inline-flex overflow-hidden rounded-full">
      <button
        onClick={() => onSnooze(minutes)}
        className="t-small px-4 py-2 font-medium active:scale-95"
      >
        {t("reminders.snooze", { n: minutes })}
      </button>
      <select
        aria-label={t("reminders.snoozeFor")}
        value={minutes}
        onChange={(e) => setMinutes(Number(e.target.value))}
        className="t-small border-line border-s bg-transparent ps-2 pe-1 outline-none"
      >
        {options.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </span>
  );
}
