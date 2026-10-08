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

/** The app icon, also used as the brand mark in the header. */
export const Mark = ({ className }: { className?: string }) => (
  // eslint-disable-next-line @next/next/no-img-element -- tiny static icon, no optimization needed
  <img
    src="/icons/icon-192.png"
    alt=""
    aria-hidden
    width={32}
    height={32}
    className={`rounded-[9px] ${className ?? ""}`}
  />
);

export const CheckIcon = (p: P) => (
  <svg {...base} strokeWidth={3} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
  </svg>
);

export const GripIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const TrashIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
  </svg>
);

export const CloseIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const StopIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
  </svg>
);

export const BellIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4" />
  </svg>
);

export const PencilIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
  </svg>
);
