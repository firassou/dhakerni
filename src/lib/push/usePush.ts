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

  const refresh = useCallback(async () => {
    if (isIos() && !isStandalone()) return setState("ios-install");
    if (!pushApisPresent()) return setState("unsupported");
    try {
      const { enabled } = (await (await fetch("/api/push/key")).json()) as { enabled: boolean };
      if (!enabled) return setState("server-off");
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

  return { state, enable, disable, refresh };
}

/** Pushes the list of future reminders to the server. Called after every change to tasks. */
export async function syncToServer(
  reminders: { taskId: string; fireAt: string; title: string }[],
): Promise<void> {
  const { sub } = await currentSubscription();
  if (!sub) return;
  await fetch("/api/reminders", {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-id": await getSessionId() },
    body: JSON.stringify({ subscription: sub.toJSON(), mode: "replace", reminders }),
  });
}
