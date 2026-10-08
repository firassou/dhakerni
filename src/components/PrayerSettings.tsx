"use client";

import { useEffect, useState } from "react";
import { getMeta, setMeta } from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import { CITY_KEYS, isCity, type CityKey } from "@/lib/prayer/cities";
import { PRAYERS, prayerTimesOn } from "@/lib/prayer/times";

/** Choose a city so prayer words become real times. Calculated on the device; nothing is sent. */
export function PrayerSettings() {
  const { t, locale } = useI18n();
  const [city, setCity] = useState<CityKey | "">("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // React may run this effect twice in development. Only the latest read may write, or a slow
    // earlier read could overwrite what the person has already chosen.
    let current = true;
    getMeta<string>("city")
      .then((c) => current && setCity(isCity(c) ? c : ""))
      .catch(() => {})
      .finally(() => current && setLoaded(true));
    return () => {
      current = false;
    };
  }, []);

  function choose(value: string) {
    const next = isCity(value) ? value : "";
    setCity(next);
    void setMeta("city", next || null);
  }

  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const times = city ? prayerTimesOn(city, new Date()) : null;

  return (
    <div className="rounded-card bg-surface space-y-3 p-4">
      <p className="text-ink-2">{t("settings.prayer.help")}</p>
      <label className="block">
        <span className="t-small text-ink-2 mb-1 block">{t("settings.prayer.city")}</span>
        <select
          disabled={!loaded}
          value={city}
          onChange={(e) => choose(e.target.value)}
          className="rounded-field bg-surface-2 focus:ring-door w-full px-3 py-3 outline-none focus:ring-2"
        >
          <option value="">{t("settings.prayer.none")}</option>
          {CITY_KEYS.map((c) => (
            <option key={c} value={c}>
              {t(`settings.prayer.cities.${c}`)}
            </option>
          ))}
        </select>
      </label>

      {times && (
        <div aria-label={t("settings.prayer.today")}>
          <p className="t-small text-ink-2 mb-1">{t("settings.prayer.today")}</p>
          <dl className="grid grid-cols-5 gap-1 text-center">
            {PRAYERS.map((p) => (
              <div key={p} className="rounded-field bg-surface-2 px-1 py-2">
                <dt className="t-micro text-ink-2">{t(`settings.prayer.names.${p}`)}</dt>
                <dd className="t-small font-medium tabular-nums" dir="ltr">
                  {fmt.format(times[p])}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
