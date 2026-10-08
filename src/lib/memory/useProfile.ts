"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProfileFact } from "../schemas";
import {
  learnFact,
  listFacts,
  toResolveOptions,
  type FactSource,
  type LearnResult,
} from "./profile";
import { sliceForParse } from "./slice";

/** The learned profile, kept in memory for instant use and written through to IndexedDB. */
export function useProfile() {
  const [facts, setFacts] = useState<ProfileFact[]>([]);
  const ref = useRef<ProfileFact[]>([]);

  useEffect(() => {
    listFacts()
      .then((f) => {
        ref.current = f;
        setFacts(f);
      })
      .catch((e) => console.error("load profile failed", e));
  }, []);

  const learn = useCallback(
    async (key: string, value: string, source: FactSource): Promise<LearnResult | null> => {
      try {
        const result = await learnFact(key, value, source);
        if (result) {
          ref.current = [...ref.current.filter((f) => f.id !== result.fact.id), result.fact];
          setFacts(ref.current);
        }
        return result;
      } catch (e) {
        console.error("save fact failed", e);
        return null;
      }
    },
    [],
  );

  /** Re-read after something else (passive learning, the memory screen) changed the profile. */
  const refresh = useCallback(async () => {
    try {
      const f = await listFacts();
      ref.current = f;
      setFacts(f);
    } catch (e) {
      console.error("refresh profile failed", e);
    }
  }, []);

  const resolveOptions = useMemo(() => toResolveOptions(facts), [facts]);
  return {
    facts,
    learn,
    refresh,
    resolveOptions,
    getResolveOptions: () => toResolveOptions(ref.current),
    /** The few facts worth sending with this sentence. */
    hintsFor: (text: string) => sliceForParse(ref.current, text),
  };
}
