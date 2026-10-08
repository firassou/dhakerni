import type { Locale } from "../i18n/locales";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const tag = (locale: Locale) => (locale === "ar" ? "ar-TN" : locale);

/** "Today 17:00", "Tomorrow 08:30", or "Fri, Oct 10 13:30". */
export function formatDue(
  iso: string,
  locale: Locale,
  now: Date,
  t: (key: string) => string,
): string {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat(tag(locale), {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: locale === "en" ? undefined : "h23",
  }).format(d);
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  if (dayDiff === 0) return `${t("time.today")} ${time}`;
  if (dayDiff === 1) return `${t("time.tomorrow")} ${time}`;
  const day = new Intl.DateTimeFormat(tag(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
  return `${day} ${time}`;
}

/** ISO instant to the value format of <input type="datetime-local">. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
