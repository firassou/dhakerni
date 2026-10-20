"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";

const SEEN_KEY = "dhakerni.introSeen";

/**
 * The opening animation. It is pure CSS, so it starts painting with the first HTML (no flash of the app
 * underneath). The script in <head> decides whether it should run at all (see NO_FLASH_SCRIPT): it is
 * skipped on repeat visits in the same session, for reduced motion, on pages other than home, and when the
 * app was opened from a notification. Tap or press any key to skip.
 */
export function Intro() {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    if (html.dataset.intro !== "on") return;
    try {
      sessionStorage.setItem(SEEN_KEY, "1"); // a reload mid-intro does not replay it
    } catch {
      /* private mode: it may replay, which is harmless */
    }
    const el = root.current;
    if (!el) return;

    const finish = () => {
      html.dataset.intro = "off";
      html.dataset.introDone = "1"; // lets the mic wake up (see globals.css)
      cleanup();
    };
    const skip = () => el.classList.add("intro-leaving");
    const onEnd = (e: AnimationEvent) => e.animationName === "intro-leave" && finish();
    const cleanup = () => {
      clearTimeout(fallback);
      el.removeEventListener("animationend", onEnd);
      window.removeEventListener("keydown", skip);
      el.removeEventListener("pointerdown", skip);
    };
    const fallback = setTimeout(finish, 4000); // never leave the app covered, whatever happens

    el.addEventListener("animationend", onEnd);
    el.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);
    return cleanup;
  }, []);

  // Rows of the checklist (y, line end). The first is already ticked, the others are still open.
  const rows = [
    { y: 22, to: 42 },
    { y: 31, to: 40 },
    { y: 41, to: 35 },
  ];

  return (
    <div ref={root} className="intro" aria-hidden="true">
      <div className="intro-stage">
        <svg
          className="intro-mark"
          viewBox="0 0 64 64"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            className="i-draw i-frame"
            pathLength={1}
            d="M48 30V19a9 9 0 0 0-9-9H19a9 9 0 0 0-9 9v26a9 9 0 0 0 9 9h12"
          />
          <path
            className="i-draw i-check"
            pathLength={1}
            strokeWidth="3"
            d="M17.5 21.5l2.3 2.3 4.2-4.6"
          />
          {rows.map((r, i) => (
            <g key={r.y} style={{ "--i": i } as React.CSSProperties}>
              {i > 0 && (
                <circle
                  className="i-dot"
                  cx="20"
                  cy={r.y}
                  r="2"
                  fill="currentColor"
                  stroke="none"
                />
              )}
              <path className="i-draw i-row" pathLength={1} d={`M29 ${r.y}H${r.to}`} />
            </g>
          ))}
          <circle className="i-ripple i-r1" cx="47" cy="46" r="8" />
          <circle className="i-ripple i-r2" cx="47" cy="46" r="8" />
          <g className="i-bell">
            <path
              className="i-bell-body"
              d="M47 35.5c-6.2 0-10.5 4.6-10.5 11.2v4.3l-3 4.5h27l-3-4.5v-4.3c0-6.6-4.3-11.2-10.5-11.2z"
            />
            <path className="i-clapper" d="M43.5 57.5a3.5 3.5 0 0 0 7 0" />
          </g>
        </svg>
        <p className="intro-word">{t("app.name")}</p>
      </div>
    </div>
  );
}
