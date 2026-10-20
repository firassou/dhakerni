import type { Transition } from "motion/react";

/**
 * Shared motion vocabulary, mirroring the CSS tokens (--ease-spring, --t-*) so JS and CSS motion feel
 * like one system. Reduced motion is handled once, by <MotionProvider>.
 */
export const spring = {
  /** Things that settle: a pill sliding, a sheet arriving. */
  soft: { type: "spring", stiffness: 380, damping: 32, mass: 0.9 } satisfies Transition,
  /** Small, snappy feedback: a press, a pop. */
  snappy: { type: "spring", stiffness: 620, damping: 30 } satisfies Transition,
  /** A playful overshoot, for rewards. */
  bouncy: { type: "spring", stiffness: 460, damping: 18 } satisfies Transition,
};

export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
};

export const duration = { fast: 0.12, base: 0.22, slow: 0.36 };
