/** How the person wants Ramadan handled: worked out from the calendar, or forced on or off. */
export const RAMADAN_MODES = ["auto", "on", "off"] as const;
export type RamadanMode = (typeof RAMADAN_MODES)[number];
export const isRamadanMode = (v: unknown): v is RamadanMode =>
  (RAMADAN_MODES as readonly unknown[]).includes(v);

const hijriMonth = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "numeric" });

/**
 * Whether this day falls in Ramadan by the Umm al-Qura calendar. Tunisia announces the month from the moon,
 * so the first and last day can differ by one: that is what the "on" and "off" choices are for.
 */
export function isRamadanDay(date: Date): boolean {
  return hijriMonth.format(date) === "9";
}

export const ramadanActive = (mode: RamadanMode, now: Date) =>
  mode === "on" || (mode === "auto" && isRamadanDay(now));

/** Iftar is at Maghrib, and suhoor ends before Fajr, all year round. */
const ALWAYS: Record<string, string> = {
  iftar: "prayer_maghrib",
  suhoor: "before_prayer_fajr",
};

/** In Ramadan "الفطور" is the meal that breaks the fast, not breakfast. */
const IN_RAMADAN: Record<string, string> = {
  after_breakfast: "after_prayer_maghrib",
};

/** Anchors that stand for another anchor today. */
export function anchorAliases(mode: RamadanMode, now: Date): Record<string, string> {
  return ramadanActive(mode, now) ? { ...ALWAYS, ...IN_RAMADAN } : ALWAYS;
}
