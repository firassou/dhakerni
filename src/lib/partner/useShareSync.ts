"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Task } from "../schemas";
import { getPairing, sendStatus } from "./partner";

const RETRY_MS = 60_000;

/**
 * Keeps the partner's copy of a shared task in step with this one. A shared task remembers the done state
 * both copies last shared (`share.done`); when it differs from `done` the person changed it here, so the
 * partner is told. If that cannot be sent (offline), it is tried again when the connection returns and every
 * minute. A change that came from the partner updates both at once, so it is never sent back.
 */
export function useShareSync(tasks: Task[], getTasks: () => Task[], upsert: (task: Task) => void) {
  const inFlight = useRef(new Set<string>());

  const sync = useCallback(
    async (list: Task[]) => {
      const pending = list.filter(
        (t) => t.share && t.share.done !== t.done && !inFlight.current.has(t.id),
      );
      if (!pending.length || !(await getPairing().catch(() => null))) return;
      for (const task of pending) {
        inFlight.current.add(task.id);
        try {
          const synced = await sendStatus(task);
          const now = getTasks().find((t) => t.id === task.id);
          // Changed again while sending: leave the link as it was, the next pass sends the newer state.
          if (now && now.done === synced.done) upsert({ ...now, share: synced.share });
        } catch {
          /* offline, or unpaired meanwhile: tried again later */
        } finally {
          inFlight.current.delete(task.id);
        }
      }
    },
    [getTasks, upsert],
  );

  useEffect(() => {
    void sync(tasks);
  }, [tasks, sync]);

  useEffect(() => {
    const again = () => void sync(getTasks());
    const id = setInterval(again, RETRY_MS);
    window.addEventListener("online", again);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", again);
    };
  }, [sync, getTasks]);
}
