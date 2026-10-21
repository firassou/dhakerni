"use client";

import { useCallback, useEffect, useState } from "react";
import {
  checkInvite,
  createInvite,
  getPairing,
  joinWithCode,
  leavePairing,
  PartnerError,
  setPartnerName,
} from "./partner";

export type PartnerState =
  | { kind: "loading" }
  | { kind: "unpaired" }
  | { kind: "inviting"; code: string; expiresAt: number }
  | { kind: "paired"; name: string };

const POLL_MS = 3000;

const KNOWN_ERRORS = new Set([
  "invalid_code",
  "own_code",
  "already_paired",
  "network",
  "unavailable",
  "rate_limited",
]);
/** The message key for an error code from the server, or the generic one. */
export const errorKey = (code: string) =>
  `partner.errors.${KNOWN_ERRORS.has(code) ? code : "generic"}`;

/** Pairing as the Settings screen and the join page see it. Errors are codes the caller words. */
export function usePartner() {
  const [state, setState] = useState<PartnerState>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const p = await getPairing().catch(() => null);
    setState(p ? { kind: "paired", name: p.name } : { kind: "unpaired" });
  }, []);

  useEffect(() => {
    // Deferred so the first render never depends on browser-only APIs.
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  // While an invitation is open, ask now and then whether the partner used it; stop when it runs out.
  const waiting = state.kind === "inviting" ? state.expiresAt : null;
  useEffect(() => {
    if (waiting === null) return;
    const tick = async () => {
      if (Date.now() > waiting) return setState({ kind: "unpaired" });
      try {
        if (await checkInvite()) await load();
      } catch {
        /* offline or busy: ask again next time */
      }
    };
    const id = setInterval(() => void tick(), POLL_MS);
    return () => clearInterval(id);
  }, [waiting, load]);

  const run = useCallback(async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof PartnerError ? e.code : "generic");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const invite = useCallback(
    (name: string) =>
      run(async () => {
        const made = await createInvite();
        await setPartnerName(name); // kept here for when they join
        setState({
          kind: "inviting",
          code: made.code,
          expiresAt: Date.now() + made.expiresInSec * 1000,
        });
      }),
    [run],
  );

  const join = useCallback(
    (code: string, name: string) =>
      run(async () => {
        await joinWithCode(code);
        await setPartnerName(name);
        await load();
      }),
    [run, load],
  );

  const unpair = useCallback(
    () =>
      run(async () => {
        await leavePairing();
        await load();
      }),
    [run, load],
  );

  const rename = useCallback(
    async (name: string) => {
      await setPartnerName(name);
      await load();
    },
    [load],
  );

  const cancelInvite = useCallback(() => setState({ kind: "unpaired" }), []);

  return { state, error, busy, invite, cancelInvite, join, unpair, rename };
}
