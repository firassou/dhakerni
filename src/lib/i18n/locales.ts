import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";

export const LOCALES = ["ar", "fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "dhakerni.locale";

export const messages = { ar, fr, en } as const;
export type Messages = typeof en;

export const isRtl = (locale: Locale) => locale === "ar";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** First supported language in the browser's preference order. */
export function matchLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function lookup(locale: Locale, key: string): string | undefined {
  let node: unknown = messages[locale];
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const raw = lookup(locale, key) ?? lookup(DEFAULT_LOCALE, key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** Inline script run before first paint so lang/dir never flash wrong. */
export const NO_FLASH_SCRIPT = `(function(){try{var s=localStorage.getItem('${LOCALE_STORAGE_KEY}');var l=['ar','fr','en'];var c=l.indexOf(s)>-1?s:null;if(!c){var n=navigator.languages||[navigator.language||'en'];for(var i=0;i<n.length;i++){var b=String(n[i]).toLowerCase().split('-')[0];if(l.indexOf(b)>-1){c=b;break}}}c=c||'en';var d=document.documentElement;d.lang=c==='ar'?'ar-TN':c;d.dir=c==='ar'?'rtl':'ltr'}catch(e){}})();`;
