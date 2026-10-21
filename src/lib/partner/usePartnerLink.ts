"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { drainInbox, getPairing, type Received } from "./partner";

const POLL_MS = 60_000;

/**
 * Who the partner is (null when not paired), and tasks they sent. The phone usually gets them through the
 * service worker; this covers a device that was offline or whose push never arrived: the inbox is read when
 * the app opens, comes back to the front, or gets its connection back, and every minute while it is open.
 */
export function usePartnerLink(onReceived: (received: Received, name: string) => void) {
  const [partner, setPartner] = useState<{ name: string } | null>(null);
  const handler = useRef(onReceived);
  useEffect(() => {
    handler.current = onReceived;
  });

  const check = useCallback(async () => {
    const p = await getPairing().catch(() => null);
    setPartner(p ? { name: p.name } : null);
    if (!p) return;
    try {
      const received = await drainInbox();
      if (received.fresh.length || received.updated.length) handler.current(received, p.name);
    } catch {
      /* offline, or the partner unpaired: the next check settles it */
      const still = await getPairing().catch(() => null);
      if (!still) setPartner(null);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void check(), 0);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, POLL_MS);
    const onShow = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("online", check);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("online", check);
    };
  }, [check]);

  return partner;
}
