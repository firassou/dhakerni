"use client";

const SPARKS = 8;
const COLORS = ["var(--brand)", "var(--sun)", "var(--rose)"];

/**
 * A short burst of sparks, mounted for a moment when a task is completed. Pure CSS (see .spark), so it
 * costs nothing while idle and reduced motion collapses it to nothing.
 */
export function Burst() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {Array.from({ length: SPARKS }, (_, i) => {
        const angle = (i / SPARKS) * Math.PI * 2 + 0.3;
        const dist = 20 + (i % 3) * 5;
        return (
          <span
            key={i}
            className="spark"
            style={
              {
                "--x": `${Math.round(Math.cos(angle) * dist)}px`,
                "--y": `${Math.round(Math.sin(angle) * dist)}px`,
                background: COLORS[i % COLORS.length],
              } as React.CSSProperties
            }
          />
        );
      })}
    </span>
  );
}
