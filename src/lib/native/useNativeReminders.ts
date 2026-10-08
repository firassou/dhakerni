"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "../i18n";
import type { Task } from "../schemas";
import { onNativeAction, syncNativeReminders, type NativeAction } from "./reminders";

const SETTLE_MS = 600;

interface Deps {
  /** Inside the Android app, with notifications allowed. */
  enabled: boolean;
  ready: boolean;
  tasks: Task[];
  snoozeMinutes: number;
  onDone: (taskId: string) => void;
  onSnooze: (taskId: string) => void;
  onOpen: (taskId: string) => void;
}

/** In the Android app: keeps the phone's own alarms equal to the tasks, and answers their buttons. */
export function useNativeReminders({
  enabled,
  ready,
  tasks,
  snoozeMinutes,
  onDone,
  onSnooze,
  onOpen,
}: Deps) {
  const { t } = useI18n();
  const handlers = useRef({ onDone, onSnooze, onOpen });
  useEffect(() => {
    handlers.current = { onDone, onSnooze, onOpen };
  });

  useEffect(() => {
    if (!enabled || !ready) return;
    const id = setTimeout(() => {
      syncNativeReminders(tasks, {
        channel: t("native.channel"),
        body: t("notify.body"),
        done: t("notify.done"),
        snooze: t("notify.snooze", { n: snoozeMinutes }),
      }).catch((e) => console.error("native reminder sync failed", e));
    }, SETTLE_MS);
    return () => clearTimeout(id);
  }, [enabled, ready, tasks, snoozeMinutes, t]);

  // A button pressed on a reminder opens the app; the tasks may still be loading when it is reported.
  const waiting = useRef<NativeAction[]>([]);
  const isReady = useRef(ready);
  useEffect(() => {
    const run = ({ taskId, action }: NativeAction) => {
      const h = handlers.current;
      if (action === "done") h.onDone(taskId);
      else if (action === "snooze") h.onSnooze(taskId);
      else h.onOpen(taskId);
    };
    isReady.current = ready;
    if (ready) waiting.current.splice(0).forEach(run);
    if (!enabled) return;
    return onNativeAction((a) => (isReady.current ? run(a) : void waiting.current.push(a)));
  }, [enabled, ready]);
}
