import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export const MicIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </svg>
);

export const ArrowUpIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
  </svg>
);

export const SlidersIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </svg>
);

/** Back arrow that mirrors itself in RTL. */
export const BackIcon = (p: P) => (
  <svg {...base} className={`rtl:-scale-x-100 ${p.className ?? ""}`} {...p}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

/** The mark: a Tunisian door arch with a sun above. */
export const Mark = (p: P) => (
  <svg viewBox="0 0 32 32" aria-hidden {...p}>
    <path d="M7 29V14.5C7 9.5 11 6 16 6s9 3.5 9 8.5V29z" fill="currentColor" />
    <circle cx="16" cy="19" r="2.4" fill="var(--sun)" />
  </svg>
);
