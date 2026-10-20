"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** One switch for reduced motion: every motion component below follows the system setting. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
