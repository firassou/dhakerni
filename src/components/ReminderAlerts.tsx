"use client";

import { useI18n } from "@/lib/i18n";
import type { Task } from "@/lib/schemas";
import { BellIcon } from "./Icon";

interface Props {
  alerts: Task[];
  snoozeMinutes: number;
  onDone: (id: string) => void;
  onSnooze: (id: string) => void;
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
            <button
              onClick={() => onSnooze(task.id)}
              className="t-small bg-surface rounded-full px-4 py-2 font-medium active:scale-95"
            >
              {t("reminders.snooze", { n: snoozeMinutes })}
            </button>
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
