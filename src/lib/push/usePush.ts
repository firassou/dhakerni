"use client";

import { useCallback, useEffect, useState } from "react";
import { getSessionId } from "../db";
import {
  isIos,
  isStandalone,
  pushApisPresent,
  urlBase64ToUint8Array,
  type PushState,
} from "./support";

async function currentSubscription() {
  const reg = await navigator.serviceWorker.ready;
  return { reg, sub: await reg.pushManager.getSubscription() };
}

/** Where notifications stand on this device, and the controls to change it. */
export function usePush() {
  const [state, setState] = useState<PushState>("loading");
  /** Whether the server is really sending reminders with the app closed. Null until known. */
  const [background, setBackground] = useState<"ok" | "stalled" | null>(null);

  const refresh = useCallback(async () => {
    if (isIos() && !isStandalone()) return setState("ios-install");
    if (!pushApisPresent()) return setState("unsupported");
    try {
      const info = (await (await fetch("/api/push/key", { cache: "no-store" })).json()) as {
        enabled: boolean;
        background?: "ok" | "stalled" | null;
      };
      if (!info.enabled) return setState("server-off");
      setBackground(info.background ?? null);
    } catch {
      return setState("server-off");
    }
    if (Notification.permission === "denied") return setState("denied");
    if (Notification.permission === "granted" && (await currentSubscription()).sub)
      return setState("enabled");
    setState("default");
  }, []);

  useEffect(() => {
    // Defer so the first render never depends on browser-only APIs.
    const id = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(id);
  }, [refresh]);

  /** Must be called from a click: browsers ignore permission prompts that are not a user gesture. */
  const enable = useCallback(async () => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return void (await refresh());
    const { key } = (await (await fetch("/api/push/key")).json()) as { key: string };
    const { reg, sub } = await currentSubscription();
    await (sub ??
      reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      }));
    await refresh();
  }, [refresh]);

  /** Turning off deletes the server's copy of the subscription and everything scheduled. */
  const disable = useCallback(async () => {
    const { sub } = await currentSubscription();
    if (sub) {
      try {
        await fetch("/api/reminders", {
          method: "POST",
          headers: { "content-type": "application/json", "x-session-id": await getSessionId() },
          body: JSON.stringify({ subscription: sub.toJSON(), forget: true, reminders: [] }),
        });
      } catch {
        /* offline: the server drops it after 60 days anyway */
      }
      await sub.unsubscribe();
    }
    await refresh();
  }, [refresh]);

  return { state, background, enable, disable, refresh };
}

/** What the last successful sync used, kept so a sync on the way out (page hidden) needs no waiting. */
let known: { sub: PushSubscriptionJSON; sid: string } | null = null;

async function identity() {
  const { sub } = await currentSubscription();
  if (!sub) return (known = null);
  return (known = { sub: sub.toJSON(), sid: await getSessionId() });
}

function post(
  who: { sub: PushSubscriptionJSON; sid: string },
  body: Record<string, unknown>,
  keepalive = false,
) {
  return fetch("/api/reminders", {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-id": who.sid },
    body: JSON.stringify({ subscription: who.sub, ...body }),
    keepalive, // lets the request finish even if the page is closed right after
  });
}

/**
 * A reminder sent through the whole real path (server, scheduler, push service, service worker) a minute
 * from now. If it arrives with the phone locked, background reminders work.
 */
export async function scheduleTestReminder(title: string, inSeconds = 60): Promise<boolean> {
  const who = await identity();
  if (!who) return false;
  const res = await post(who, {
    mode: "upsert",
    reminders: [
      {
        taskId: `test-${crypto.randomUUID()}`,
        fireAt: new Date(Date.now() + inSeconds * 1000).toISOString(),
        title,
        once: true,
      },
    ],
  });
  return res.ok;
}

/**
 * Pushes the list of future reminders to the server, and the ids of tasks that were answered (done or
 * deleted) so their repeats stop. Throws when the server did not take it, so the caller tries again.
 * `leaving` is for a page that is being hidden or closed: no waiting, and the request outlives the page.
 */
export async function syncToServer(
  reminders: { taskId: string; fireAt: string; title: string; once?: boolean }[],
  cancel: string[] = [],
  leaving = false,
): Promise<void> {
  const who = leaving ? known : await identity();
  if (!who) return;
  const res = await post(who, { mode: "replace", reminders, cancel }, leaving);
  if (!res.ok) throw new Error(`reminder sync ${res.status}`);
}
