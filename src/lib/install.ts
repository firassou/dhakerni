"use client";

import { useSyncExternalStore } from "react";

/** Chrome's "this site can be installed" event. It is not in the standard DOM types. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The browser fires the event once, early, and only when the app is installable and not installed yet.
// It is caught here, at module load, so no screen can miss it by mounting late.
let saved: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep the browser's own banner away: the app offers its button instead
    saved = e as BeforeInstallPromptEvent;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    saved = null;
    changed();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Whether the browser offers to install the app right now, and the call that opens its install dialog.
 * False once installed, and in browsers with no install prompt (Firefox, Safari).
 */
export function useInstall() {
  const canInstall = useSyncExternalStore(
    subscribe,
    () => saved !== null,
    () => false,
  );
  /** Must be called from a click. The browser allows one prompt per event. */
  const install = async () => {
    const event = saved;
    if (!event) return;
    saved = null;
    changed();
    await event.prompt();
    await event.userChoice.catch(() => {});
  };
  return { canInstall, install };
}
