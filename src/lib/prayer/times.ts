import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";
import { CITIES, type CityKey } from "./cities";

export const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type Prayer = (typeof PRAYERS)[number];

/** "After the prayer" means the adhan plus about the length of the prayer itself. */
export const AFTER_PRAYER_MIN = 20;

/**
 * Tunisia's Ministry of Religious Affairs: Fajr and Isha at 18 degrees. Asr uses the standard shadow
 * length (Maliki, Shafi'i and Hanbali), not the Hanafi double shadow.
 */
function params() {
  const p = CalculationMethod.Other();
  p.fajrAngle = 18;
  p.ishaAngle = 18;
  p.madhab = Madhab.Shafi;
  return p;
}

export function prayerTimesOn(city: CityKey, date: Date): Record<Prayer, Date> {
  const { lat, lon } = CITIES[city];
  const t = new PrayerTimes(new Coordinates(lat, lon), date, params());
  return { fajr: t.fajr, dhuhr: t.dhuhr, asr: t.asr, maghrib: t.maghrib, isha: t.isha };
}

export const isPrayer = (v: string): v is Prayer => (PRAYERS as readonly string[]).includes(v);

/** "Before the prayer" with no distance said: time to stop what you are doing and get ready. */
export const BEFORE_PRAYER_MIN = 15;

/**
 * Anchor keys: `prayer_asr` is at the prayer, `after_prayer_asr` shortly after it, `before_prayer_asr`
 * shortly before it.
 */
export function parsePrayerAnchor(
  anchor: string,
): { prayer: Prayer; after: boolean; before: boolean } | null {
  const m = /^(after_|before_)?prayer_(\w+)$/.exec(anchor);
  return m && isPrayer(m[2])
    ? { prayer: m[2], after: m[1] === "after_", before: m[1] === "before_" }
    : null;
}

/**
 * The next moment that prayer occurs, today or tomorrow, moved by the offset for "after" and "before".
 * `minutes` replaces the usual distance when the person said one.
 */
export function nextPrayerMoment(
  city: CityKey,
  anchor: string,
  now: Date,
  minutes?: number | null,
): Date | null {
  const parsed = parsePrayerAnchor(anchor);
  if (!parsed) return null;
  const offset = parsed.after
    ? (minutes ?? AFTER_PRAYER_MIN) * 60_000
    : parsed.before
      ? -(minutes ?? BEFORE_PRAYER_MIN) * 60_000
      : 0;
  for (let day = 0; day <= 1; day++) {
    const on = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, 12);
    const at = new Date(prayerTimesOn(city, on)[parsed.prayer].getTime() + offset);
    if (at > now) return at;
  }
  return null;
}
