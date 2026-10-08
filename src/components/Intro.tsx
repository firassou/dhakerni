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

  const rows = [
    { y: 20, to: 42 },
    { y: 30, to: 38 },
    { y: 40, to: 34 },
  ];

  return (
    <div ref={root} className="intro" aria-hidden="true">
      <div className="intro-stage">
        <svg
          className="intro-mark"
          viewBox="0 0 64 64"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            className="i-draw i-frame"
            pathLength={1}
            d="M54 34V18a10 10 0 0 0-10-10H20a10 10 0 0 0-10 10v28a10 10 0 0 0 10 10h14"
          />
          {rows.map((r, i) => (
            <g key={r.y} style={{ "--i": i } as React.CSSProperties}>
              <circle
                className="i-dot"
                cx="21"
                cy={r.y}
                r="1.7"
                fill="currentColor"
                stroke="none"
              />
              <path className="i-draw i-row" pathLength={1} d={`M28 ${r.y}H${r.to}`} />
            </g>
          ))}
          <circle className="i-ripple i-r1" cx="46" cy="49" r="7" />
          <circle className="i-ripple i-r2" cx="46" cy="49" r="7" />
          <g className="i-bell">
            <path d="M46 40.5V43" />
            <path d="M39 52c0-5.2 2.9-9 7-9s7 3.8 7 9l1.5 2.5h-17z" />
            <path className="i-clapper" d="M44 58a2 2 0 0 0 4 0" />
          </g>
        </svg>
        <p className="intro-word">{t("app.name")}</p>
      </div>
    </div>
  );
}
