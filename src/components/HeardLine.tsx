"use client";

import { motion } from "motion/react";
import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { spring } from "@/lib/motion";

/** Words arrive one after another, but never take longer than this in total. */
const REVEAL_MS = 900;

/**
 * What the microphone heard, one tappable word at a time. Tapping a word turns it into a small field:
 * fix it and press Enter (or tap away) and `onChange` gets the whole corrected sentence.
 */
export function HeardLine({
  text,
  onChange,
}: {
  text: string;
  onChange: (corrected: string) => void;
}) {
  const { t } = useI18n();
  const words = text.split(/\s+/).filter(Boolean);
  const [editing, setEditing] = useState<number | null>(null);
  const done = useRef(false); // Enter and the blur it causes must commit once, not twice
  const step = Math.min(0.07, REVEAL_MS / 1000 / Math.max(1, words.length));

  function commit(index: number, value: string) {
    if (done.current) return;
    done.current = true;
    setEditing(null);
    const fixed = value.trim();
    if (!fixed || fixed === words[index]) return;
    onChange([...words.slice(0, index), fixed, ...words.slice(index + 1)].join(" "));
  }

  return (
    <p className="t-lead flex flex-wrap gap-x-1.5 gap-y-1" data-bidi>
      {words.map((word, i) =>
        editing === i ? (
          <input
            key={`${i}-edit`}
            autoFocus
            defaultValue={word}
            aria-label={t("voice.fixWord", { word })}
            size={Math.max(3, word.length + 1)}
            onFocus={(e) => {
              done.current = false;
              e.currentTarget.select();
            }}
            onBlur={(e) => commit(i, e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit(i, e.currentTarget.value);
              if (e.key === "Escape") {
                done.current = true;
                setEditing(null);
              }
            }}
            className="bg-brand-soft text-ink rounded-md px-1 outline-2 outline-[var(--brand)]"
          />
        ) : (
          <motion.button
            key={`${i}-${word}`}
            type="button"
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...spring.snappy, delay: i * step }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setEditing(i)}
            aria-label={t("voice.fixWord", { word })}
            className="hover:bg-brand-soft rounded-md px-1 transition-colors"
          >
            {word}
          </motion.button>
        ),
      )}
    </p>
  );
}
