"use client";

import { useEffect, useRef } from "react";

const BARS = 28;

/** Live level bars. Writes straight to the DOM each frame, so React never re-renders at 60fps. */
export function Waveform({ analyser }: { analyser: AnalyserNode | null }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const binsPerBar = Math.max(1, Math.floor((data.length * 0.75) / BARS));
    let raf = 0;
    const draw = () => {
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < BARS; i++) {
        let sum = 0;
        for (let j = 0; j < binsPerBar; j++) sum += data[i * binsPerBar + j] ?? 0;
        const level = Math.min(1, (sum / binsPerBar / 255) * 1.8);
        const el = bars.current[i];
        if (el) el.style.transform = `scaleY(${0.12 + level * 0.88})`;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  return (
    <div aria-hidden className="flex h-10 flex-1 items-center justify-center gap-[3px]">
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          className="bg-door h-full w-[3px] origin-center rounded-full"
          style={{ transform: "scaleY(0.12)" }}
        />
      ))}
    </div>
  );
}
