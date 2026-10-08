"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { setMeta } from "../db";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isLocale,
  isRtl,
  matchLocale,
  translate,
  type Locale,
} from "./locales";

type Preference = Locale | "system";

interface I18nValue {
  locale: Locale;
  preference: Preference;
  setPreference: (p: Preference) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function readPreference(): Preference {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function resolve(pref: Preference): Locale {
  if (pref !== "system") return pref;
  return matchLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

function applyToDocument(locale: Locale) {
  const el = document.documentElement;
  el.lang = locale === "ar" ? "ar-TN" : locale;
  el.dir = isRtl(locale) ? "rtl" : "ltr";
}

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore<Preference>(subscribe, readPreference, () => "system");
  // Server and first client render both use the default locale; the real one
  // arrives right after hydration, so markup always matches.
  const locale = useSyncExternalStore<Locale>(
    subscribe,
    () => resolve(readPreference()),
    () => DEFAULT_LOCALE,
  );

  useEffect(() => {
    applyToDocument(locale);
    // The service worker cannot read localStorage, so it learns the language from IndexedDB.
    setMeta("locale", locale).catch(() => {});
  }, [locale]);

  const setPreference = useCallback((pref: Preference) => {
    try {
      if (pref === "system") localStorage.removeItem(LOCALE_STORAGE_KEY);
      else localStorage.setItem(LOCALE_STORAGE_KEY, pref);
    } catch {
      /* storage blocked: preference lasts for this session only */
    }
    listeners.forEach((l) => l());
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ locale, preference, setPreference, t: (k, v) => translate(locale, k, v) }),
    [locale, preference, setPreference],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
