"use client";

import { useEffect, useRef } from "react";
import {
  DIGEST_ID,
  digestAt,
  digestCounts,
  EARLY_SUFFIX,
  upcomingReminders,
  type DigestCounts,
} from "../reminders/engine";
import type { Task } from "../schemas";
import { syncToServer } from "./usePush";

const SETTLE_MS = 1000; // several quick edits become one request
const RETRY_MS = 15_000;
const REFRESH_MS = 10 * 60_000;
const MAX_SENT = 200; // the server takes no more; the soonest ones matter most

/**
 * Keeps the server's copy of the reminders equal to the tasks, and does not let go until it is:
 * - after every change (once the edits settle),
 * - again if the request failed (offline, server busy),
 * - at once when the page is hidden or closed, because on a phone that is usually the last moment the
 *   page runs: a task added and the phone locked a second later must still be on the server,
 * - and every few minutes while open, which also repairs anything the server lost.
 */
export function useReminderSync({
  enabled,
  tasks,
  getTasks,
  digest,
}: {
  enabled: boolean;
  tasks: Task[];
  getTasks: () => Task[];
  /**
   * The evening summary, when the person switched it on: how to word tonight's counts. It is written here
   * on the device and travels as one more reminder, so the server learns nothing new about the tasks.
   */
  digest: ((counts: DigestCounts) => string) | null;
}) {
  const digestOn = digest !== null;
  const dirty = useRef(false);
  const busy = useRef(false);
  /** Open tasks at the last successful sync. One that is gone since was answered: stop its repeats. */
  const openBefore = useRef<Set<string> | null>(null);
  const latest = useRef({ getTasks, digest });
  useEffect(() => {
    latest.current = { getTasks, digest };
  });

  const flush = useRef(async (leaving = false) => {
    if (busy.current && !leaving) return;
    busy.current = true;
    const all = latest.current.getTasks();
    const now = new Date();
    const open = new Set(all.filter((t) => !t.done).map((t) => t.id));
    const cancel = [...(openBefore.current ?? [])]
      .filter((id) => !open.has(id))
      .flatMap((id) => [id, `${id}${EARLY_SUFFIX}`]);
    const reminders = upcomingReminders(all, now);
    const at = latest.current.digest ? digestAt(now) : null;
    const counts = at ? digestCounts(all, now) : null;
    if (at && counts) {
      reminders.push({
        taskId: DIGEST_ID,
        fireAt: at.toISOString(),
        title: latest.current.digest!(counts),
        once: true,
      });
    }
    reminders.sort((a, b) => a.fireAt.localeCompare(b.fireAt));
    try {
      dirty.current = false;
      await syncToServer(reminders.slice(0, MAX_SENT), cancel.slice(0, MAX_SENT), leaving);
      openBefore.current = open;
    } catch (e) {
      dirty.current = true; // not taken: the retry timer sends it again
      console.error("reminder sync failed", e);
    } finally {
      busy.current = false;
    }
  });

  // After every change to the tasks.
  useEffect(() => {
    if (!enabled) return;
    dirty.current = true;
    const id = setTimeout(() => void flush.current(), SETTLE_MS);
    return () => clearTimeout(id);
  }, [enabled, tasks, digestOn]);

  useEffect(() => {
    if (!enabled) return;
    const retry = setInterval(() => {
      if (dirty.current) void flush.current();
    }, RETRY_MS);
    const refresh = setInterval(() => void flush.current(), REFRESH_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden" && dirty.current) void flush.current(true);
    };
    const onShow = () => {
      if (document.visibilityState === "visible") void flush.current();
    };
    const onOnline = () => void flush.current();
    document.addEventListener("visibilitychange", onHide);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(retry);
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled]);
}
