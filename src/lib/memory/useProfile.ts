"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMeta } from "../db";
import { isCity, type CityKey } from "../prayer/cities";
import { anchorAliases, isRamadanMode, type RamadanMode } from "../prayer/ramadan";
import { nextPrayerMoment } from "../prayer/times";
import type { ProfileFact } from "../schemas";
import { applyHeard, heardFixes } from "./heard";
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
  const cityRef = useRef<CityKey | null>(null);
  const ramadanRef = useRef<RamadanMode>("auto");

  useEffect(() => {
    listFacts()
      .then((f) => {
        ref.current = f;
        setFacts(f);
      })
      .catch((e) => console.error("load profile failed", e));
  }, []);

  // The city is a setting the person chose, not something learned.
  useEffect(() => {
    getMeta<string>("city")
      .then((c) => {
        cityRef.current = isCity(c) ? c : null;
      })
      .catch(() => {});
    getMeta<string>("ramadan")
      .then((m) => {
        ramadanRef.current = isRamadanMode(m) ? m : "auto";
      })
      .catch(() => {});
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
    getResolveOptions: () => ({
      ...toResolveOptions(ref.current),
      prayerMoment: cityRef.current
        ? (anchor: string, now: Date, minutes?: number | null) =>
            nextPrayerMoment(cityRef.current!, anchor, now, minutes)
        : undefined,
      anchorAliases: anchorAliases(ramadanRef.current, new Date()),
    }),
    /** A fresh transcript with the person's known fixes already made. */
    fixHeard: (text: string) => applyHeard(text, heardFixes(ref.current)),
    /** The few facts worth sending with this sentence. */
    hintsFor: (text: string) => sliceForParse(ref.current, text),
  };
}
