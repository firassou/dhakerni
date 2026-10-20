"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getOnline, markOffline, markOnline, subscribeOnline } from "./online";

/** True while the network is usable. Always true on the server, so the first paint never flashes "offline". */
export function useOnline(): boolean {
  useEffect(() => {
    // Seed from the browser, then follow its events.
    if (!navigator.onLine) markOffline();
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);
  return useSyncExternalStore(subscribeOnline, getOnline, () => true);
}
