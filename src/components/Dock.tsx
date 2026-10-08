"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { useRecorder, type RecorderError } from "@/lib/voice/useRecorder";
import { ArrowUpIcon, CloseIcon, MicIcon, StopIcon } from "./Icon";
import { Waveform } from "./Waveform";

const HOLD_MS = 350; // shorter than this counts as a tap: keep recording until Stop

interface Props {
  busy: boolean;
  onSubmitText: (text: string) => void;
  onAudio: (audio: Blob, durationMs: number) => void;
  onVoiceError: (kind: RecorderError) => void;
}

/** Bottom dock, always within thumb reach. Hold the mic to talk, or tap to start and tap again to stop. */
export function Dock({ busy, onSubmitText, onAudio, onVoiceError }: Props) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [tapMode, setTapMode] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const downAt = useRef(0);
  const pointerDown = useRef(false);

  const rec = useRecorder({
    onRecorded: (blob, ms) => {
      setTapMode(false);
      onAudio(blob, ms);
    },
    onError: (kind) => {
      setTapMode(false);
      onVoiceError(kind);
    },
  });
  const active = rec.state !== "idle";
  const recording = rec.state === "recording";

  useEffect(() => {
    if (!recording) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - t0), 200);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") rec.cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(id);
      window.removeEventListener("keydown", onKey);
      setElapsed(0);
    };
  }, [recording, rec]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSubmitText(value);
    setText("");
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (busy || e.button > 0) return;
    if (active) {
      // second tap while in tap mode
      if (tapMode) rec.stop();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerDown.current = true;
    downAt.current = Date.now();
    void rec.start();
  }

  function onPointerUp() {
    if (!pointerDown.current) return;
    pointerDown.current = false;
    if (Date.now() - downAt.current < HOLD_MS) setTapMode(true);
    else rec.stop();
  }

  function onPointerCancel() {
    if (!pointerDown.current) return;
    pointerDown.current = false;
    rec.cancel();
  }

  // Keyboard and assistive tech trigger click with detail 0: toggle like tap mode.
  function onClick(e: React.MouseEvent) {
    if (e.detail !== 0 || busy) return;
    if (active) rec.stop();
    else {
      setTapMode(true);
      void rec.start();
    }
  }

  const seconds = Math.floor(elapsed / 1000);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const hasText = text.trim().length > 0 && !active;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4">
      <form
        onSubmit={submit}
        className="glass safe-bottom pointer-events-auto mb-3 flex w-full max-w-xl items-center gap-2 rounded-[28px] p-2"
      >
        {active ? (
          <>
            {tapMode && (
              <button
                type="button"
                onClick={() => rec.cancel()}
                aria-label={t("dock.cancel")}
                className="text-ink-2 hover:bg-surface-2 grid size-11 shrink-0 place-items-center rounded-full"
              >
                <CloseIcon />
              </button>
            )}
            <div
              className="flex min-w-0 flex-1 items-center gap-3 ps-3"
              role="status"
              aria-live="polite"
            >
              <Waveform analyser={rec.analyser} />
              <span className="t-small text-ink-2 tabular-nums">
                {recording ? clock : t("dock.listening")}
              </span>
            </div>
            {!tapMode && <span className="sr-only">{t("dock.release")}</span>}
          </>
        ) : (
          <>
            <label className="sr-only" htmlFor="quick-add">
              {t("dock.inputLabel")}
            </label>
            <input
              id="quick-add"
              data-bidi
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={busy ? t("dock.processing") : t("dock.placeholder")}
              autoComplete="off"
              enterKeyHint="send"
              className="placeholder:text-ink-2 min-w-0 flex-1 bg-transparent px-3 py-3 outline-none"
            />
          </>
        )}

        {hasText ? (
          <button
            type="submit"
            aria-label={t("dock.send")}
            className="bg-ink text-paper grid size-12 shrink-0 place-items-center rounded-full transition-transform duration-[var(--t-fast)] active:scale-90"
          >
            <ArrowUpIcon />
          </button>
        ) : (
          <button
            type="button"
            disabled={busy && !active}
            aria-label={active ? t("dock.stop") : t("dock.talk")}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onClick={onClick}
            onContextMenu={(e) => e.preventDefault()}
            className={`mic text-door-ink grid size-14 shrink-0 touch-none place-items-center rounded-full transition-[transform,background-color] duration-[var(--t-base)] ease-[var(--ease-spring)] select-none disabled:opacity-50 ${
              recording
                ? "mic-live bg-danger scale-110"
                : "bg-door shadow-[0_6px_18px_rgb(33_82_209/0.4)]"
            }`}
          >
            {recording && tapMode ? (
              <StopIcon width={22} height={22} />
            ) : (
              <MicIcon width={26} height={26} />
            )}
          </button>
        )}
      </form>
    </div>
  );
}
