"use client";

import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "@/lib/i18n";
import { spring } from "@/lib/motion";
import type { CaptureOutcome } from "@/lib/ai/useCapture";
import { formatDue } from "@/lib/time/format";
import { HeardLine } from "./HeardLine";
import { CheckIcon, CloseIcon } from "./Icon";

interface Props {
  /** The sentence as heard (with the person's learned fixes applied). */
  heard: string;
  /** What it became; null while it is still being understood. */
  outcome: CaptureOutcome | null;
  now: Date;
  /** A word was fixed: the whole corrected sentence. */
  onCorrect: (corrected: string) => void;
  onUndo: () => void;
  onClose: () => void;
  /** Pointer or focus is inside the card: the owner keeps it open while true. */
  onHold: (held: boolean) => void;
}

/**
 * After you speak: the words you said, then the task they turned into. The task is already saved, so
 * there is nothing to confirm; Undo takes it back, and a tap on a wrong word fixes it and redoes it.
 */
export function VoiceCard({ heard, outcome, now, onCorrect, onUndo, onClose, onHold }: Props) {
  const { t, locale } = useI18n();
  const made = outcome?.created ?? [];
  const changed = outcome?.changed ?? [];
  const empty = outcome !== null && made.length === 0 && changed.length === 0;

  return (
    <motion.section
      layout
      role="status"
      aria-live="polite"
      onPointerEnter={() => onHold(true)}
      onPointerLeave={() => onHold(false)}
      onFocusCapture={() => onHold(true)}
      onBlurCapture={() => onHold(false)}
      initial={{ opacity: 0, y: -14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.16 } }}
      transition={spring.soft}
      className="rounded-group bg-surface mb-3 overflow-hidden px-4 pt-3 pb-3 shadow-[0_8px_28px_rgb(0_0_0/0.10)]"
    >
      <div className="flex items-center justify-between">
        <span className="t-micro text-ink-2 font-medium">{t("voice.heard")}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("voice.close")}
          className="text-ink-2 hover:bg-surface-2 -me-2 grid size-8 place-items-center rounded-full"
        >
          <CloseIcon width={18} height={18} />
        </button>
      </div>

      <HeardLine key={heard} text={heard} onChange={onCorrect} />

      <AnimatePresence mode="wait" initial={false}>
        {outcome === null ? (
          <motion.div
            key="thinking"
            exit={{ opacity: 0 }}
            className="shimmer rounded-field mt-3 h-12"
            aria-hidden
          />
        ) : (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.soft}
            className="mt-3 space-y-2"
          >
            {[...made, ...changed].map((task, i) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...spring.soft, delay: i * 0.06 }}
                className="bg-surface-2 rounded-field flex items-center gap-3 px-3 py-2.5"
              >
                <motion.span
                  initial={{ scale: 0, rotate: -40 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ ...spring.bouncy, delay: 0.1 + i * 0.06 }}
                  className="bg-brand text-brand-glyph grid size-7 shrink-0 place-items-center rounded-full"
                >
                  <CheckIcon className="size-4" />
                </motion.span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium" data-bidi>
                    {task.title}
                  </span>
                  <span className="t-micro text-ink-2 flex flex-wrap gap-x-3">
                    <span>{made.includes(task) ? t("voice.added") : t("voice.updated")}</span>
                    {task.dueAt && (
                      <span className="text-sun-ink bg-sun/40 rounded-full px-2">
                        {formatDue(task.dueAt, locale, now, t)}
                      </span>
                    )}
                    {task.items.length > 0 && (
                      <span>{t("voice.items", { count: task.items.length })}</span>
                    )}
                  </span>
                </span>
              </motion.div>
            ))}
            {empty && <p className="t-small text-ink-2">{t("voice.nothing")}</p>}
            <div className="flex items-center justify-between gap-3">
              <span className="t-micro text-ink-2">{!empty && t("voice.fixHint")}</span>
              {!empty && (
                <button
                  type="button"
                  onClick={onUndo}
                  className="t-small text-brand-text hover:bg-brand-soft rounded-full px-3 py-1.5 font-medium active:scale-95"
                >
                  {t("voice.undo")}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
