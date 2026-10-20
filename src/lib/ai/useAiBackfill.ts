"use client";

import { useEffect, useRef, useState } from "react";
import { useUndoToast } from "@/components/Toast";
import { useI18n } from "@/lib/i18n";
import type { LearnedOptions } from "@/lib/memory/profile";
import { useOnline } from "@/lib/net/useOnline";
import type { Task } from "@/lib/schemas";
import { ApiError } from "./client";
import { understand } from "./understand";

const RETRY_MS = 60_000; // after "too many requests"

interface Deps {
  tasks: readonly Task[];
  ready: boolean;
  getTasks: () => Task[];
  insert: (tasks: Task[]) => void;
  remove: (id: string) => void;
  upsert: (task: Task) => void;
  getResolveOptions: () => LearnedOptions;
  hintsFor: (text: string) => string[];
}

/**
 * Tasks saved as written while offline (`aiPending`) go through the AI once the network is back, one at a
 * time, and are replaced by what it understood. A failure leaves the task as it is for the next try.
 */
export function useAiBackfill({
  tasks,
  ready,
  getTasks,
  insert,
  remove,
  upsert,
  getResolveOptions,
  hintsFor,
}: Deps) {
  const { t, locale } = useI18n();
  const undoToast = useUndoToast();
  const online = useOnline();
  const running = useRef(false);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [retry, setRetry] = useState(0);
  const waiting = tasks
    .filter((x) => x.aiPending)
    .map((x) => x.id)
    .join(",");

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!ready || !online || !waiting || running.current) return;
    running.current = true;

    (async () => {
      for (const id of waiting.split(",")) {
        if (!alive.current) return false;
        const mine = getTasks().find((x) => x.id === id);
        if (!mine?.aiPending) continue;
        const settled: Task = { ...mine, aiPending: false };
        // Done already, or the person gave it a time: nothing left for the AI to add.
        if (mine.done || mine.dueAt) {
          upsert(settled);
          continue;
        }
        try {
          const { fresh, changed, before } = await understand(mine.title, {
            // Without itself: it must not match its own words as "a task this sentence is about".
            tasks: getTasks().filter((x) => x.id !== id),
            locale,
            hints: hintsFor(mine.title),
            options: getResolveOptions(),
          });
          if (!fresh.length && !changed.length) {
            upsert(settled);
            continue;
          }
          remove(id);
          insert(fresh);
          changed.forEach(upsert);
          undoToast(t("capture.backfilled", { title: mine.title }), () => {
            fresh.forEach((c) => remove(c.id));
            before.forEach(upsert);
            insert([settled]);
          });
        } catch (e) {
          if (e instanceof ApiError && e.kind === "rate_limited")
            timer.current = setTimeout(() => setRetry((n) => n + 1), RETRY_MS);
          return false; // offline again, or the server is struggling: try on the next change
        }
      }
      return true;
    })().then((completed) => {
      running.current = false;
      // Tasks saved while this ran were not in its list.
      if (completed && alive.current && getTasks().some((x) => x.aiPending)) setRetry((n) => n + 1);
    });
  }, [
    ready,
    online,
    waiting,
    retry,
    getTasks,
    insert,
    remove,
    upsert,
    getResolveOptions,
    hintsFor,
    locale,
    t,
    undoToast,
  ]);
}
