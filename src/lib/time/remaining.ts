import type { Locale } from "../i18n/locales";

const MIN = 60_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * A casual "how long until" for an upcoming task: "in 25 minutes", "in 3 hours", "tomorrow", "in 3 days".
 * Deliberately rounded, never exact (the exact time is shown next to it). Null for the past or the far future.
 */
export function formatRemaining(iso: string, now: Date, locale: Locale): string | null {
  const due = new Date(iso);
  const diff = due.getTime() - now.getTime();
  if (diff <= 0) return null;

  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-TN" : locale, { numeric: "auto" });
  const minutes = Math.round(diff / MIN);

  if (minutes < 1) return rtf.format(0, "minute"); // "this minute"
  if (minutes < 60) return rtf.format(minutes, "minute");

  const hours = Math.round(diff / (60 * MIN));
  const days = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
  if (days === 0 || (hours < 20 && days <= 1)) return rtf.format(Math.max(1, hours), "hour");
  if (days <= 13) return rtf.format(days, "day");
  if (days <= 56) return rtf.format(Math.round(days / 7), "week");
  return null;
}
