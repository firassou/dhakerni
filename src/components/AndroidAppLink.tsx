"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { isNativeApp } from "@/lib/native/reminders";
import { isAndroid } from "@/lib/push/support";

/** Always the newest APK: the file attached to the latest GitHub release. */
export const APK_URL = "https://github.com/firassou/dhakerni/releases/latest/download/dhakerni.apk";

/**
 * On an Android phone, in a browser: offers the Android app, where reminders ring from the phone itself.
 * Nothing is shown inside the app, or on other devices.
 */
export function AndroidAppLink() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  useEffect(() => {
    // Decided after mount: the server cannot know what device this is.
    const id = setTimeout(() => setShow(isAndroid() && !isNativeApp()), 0);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;
  return (
    <section aria-labelledby="android-h" className="mt-10">
      <h2 id="android-h" className="t-small text-ink-2 mb-2 font-medium">
        {t("native.get.title")}
      </h2>
      <div className="rounded-card bg-surface space-y-3 p-4">
        <p>{t("native.get.body")}</p>
        <a
          href={APK_URL}
          className="t-small bg-door text-door-ink inline-block rounded-full px-4 py-2 font-medium active:scale-95"
        >
          {t("native.get.action")}
        </a>
      </div>
    </section>
  );
}
