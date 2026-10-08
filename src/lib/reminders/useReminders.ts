"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import type { Task } from "../schemas";
import { dueNow, isStale, snoozed } from "./engine";

const TICK_MS = 5000;

interface Deps {
  tasks: Task[];
  getTasks: () => Task[];
  ready: boolean;
  upsert: (task: Task) => void;
  toggle: (id: string) => void;
  snoozeMinutes: number;
}

/**
 * Shows due reminders inside the app, and always as a system notification too, so the reminder is in the
 * phone's notification list whether or not anyone is looking at the app. The server sends its own push for
 * the same reminder (same tag, so one entry): this copy is the one that works with no server at all.
 */
export function useReminders({ tasks, getTasks, ready, upsert, toggle, snoozeMinutes }: Deps) {
  const { t } = useI18n();
  const [shown, setShown] = useState<string[]>([]);
  const latest = useRef({ upsert, t, snoozeMinutes });
  useEffect(() => {
    latest.current = { upsert, t, snoozeMinutes };
  });

  const check = useCallback(() => {
    const now = new Date();
    const fresh: string[] = [];
    for (const task of dueNow(getTasks(), now)) {
      const { upsert: save, t: tr, snoozeMinutes: minutes } = latest.current;
      save({ ...task, notifiedAt: now.toISOString() });
      if (isStale(task, now)) continue; // long past: mark it, don't interrupt
      fresh.push(task.id);
      if ("Notification" in window && Notification.permission === "granted") {
        void navigator.serviceWorker?.ready.then((reg) =>
          reg.showNotification(task.title, {
            body: tr("notify.body"),
            tag: `task-${task.id}`,
            data: { taskId: task.id },
            icon: "/icons/icon-192.png",
            requireInteraction: true,
            renotify: true,
            vibrate: [400, 200, 400, 200, 800],
            actions: [
              { action: "done", title: tr("notify.done") },
              { action: "snooze", title: tr("notify.snooze", { n: minutes }) },
              { action: "open", title: tr("notify.open") },
            ],
          } as NotificationOptions),
        );
      }
    }
    if (fresh.length) {
      navigator.vibrate?.(150);
      setShown((s) => [...new Set([...s, ...fresh])]);
    }
  }, [getTasks]);

  useEffect(() => {
    if (!ready) return;
    const first = setTimeout(check, 400);
    const id = setInterval(check, TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [ready, check]);

  const hide = useCallback((id: string) => setShown((s) => s.filter((x) => x !== id)), []);
  /** Bring one task's reminder up, e.g. after a click on the system notification. */
  const focus = useCallback((id: string) => setShown((s) => [...new Set([...s, id])]), []);

  const done = useCallback(
    (id: string) => {
      hide(id);
      toggle(id);
    },
    [hide, toggle],
  );
  const snooze = useCallback(
    (id: string, minutes: number = snoozeMinutes) => {
      const task = getTasks().find((x) => x.id === id);
      hide(id);
      if (task) upsert(snoozed(task, minutes, new Date()));
    },
    [getTasks, hide, snoozeMinutes, upsert],
  );

  const alerts = shown
    .map((id) => tasks.find((x) => x.id === id))
    .filter((x): x is Task => !!x && !x.done);
  return { alerts, hide, focus, done, snooze };
}
