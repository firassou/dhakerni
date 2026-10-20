import type { Locale } from "./i18n/locales";

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits to 0-9. */
const latinDigits = (s: string) =>
  s.replace(ARABIC_DIGITS, (d) => String((d.charCodeAt(0) - 0x660) % 0x90));

/**
 * An amount as printed on a bill to whole millimes: "45,300", "45.300", "1 234,500", "٤٥٫٣٠٠", "45 DT".
 * Tunisian bills have three decimals, so a lone separator followed by exactly three digits is the
 * decimal point ("45,300" is 45.300 DT, not 45300). Returns null when no amount can be read.
 */
export function parseMillimes(raw: string): number | null {
  const s = latinDigits(raw)
    .replace(/[٫]/g, ".")
    .replace(/[٬\s  ']/g, "")
    .match(/\d[\d.,]*\d|\d/)?.[0];
  if (!s) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const last = Math.max(lastDot, lastComma);
  let whole = s;
  let frac = "";
  if (last >= 0) {
    const sep = s[last];
    const after = s.slice(last + 1);
    const sepCount = s.split(sep).length - 1;
    const other = sep === "." ? "," : ".";
    // Several of the same mark, or a different mark after it, means it groups thousands.
    const groups = sepCount > 1 || (s.includes(other) && s.lastIndexOf(other) > last);
    if (!groups && after.length > 0) {
      whole = s.slice(0, last);
      frac = after;
    }
  }
  const digits = whole.replace(/[.,]/g, "");
  if (!/^\d*$/.test(digits) || !/^\d*$/.test(frac)) return null;
  const millimes = Number(digits || "0") * 1000 + Number(frac.padEnd(3, "0").slice(0, 3));
  return Number.isFinite(millimes) ? millimes : null;
}

/** "45,300 DT" / "45.300 DT" / "٤٥٫٣٠٠ د.ت", always three decimals as on the bill. */
export function formatMillimes(millimes: number, locale: Locale): string {
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-TN" : locale, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(millimes / 1000);
  return `${number} ${locale === "ar" ? "د.ت" : "DT"}`;
}
