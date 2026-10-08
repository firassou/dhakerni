"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { quickAnswers, type Answer } from "@/lib/questions/answers";
import { questionText } from "@/lib/questions/describe";
import type { Task } from "@/lib/schemas";
import { useRecorder } from "@/lib/voice/useRecorder";
import { CloseIcon, MicIcon, StopIcon } from "./Icon";

interface Props {
  task: Task;
  busy: boolean;
  onAnswer: (answer: Answer) => void;
  onVoice: (audio: Blob, durationMs: number) => void;
  onDismiss: () => void;
  onVoiceError: (kind: string) => void;
}

const chip =
  "t-small rounded-full border border-ink/15 bg-surface px-3.5 py-2 font-medium transition-transform duration-[var(--t-fast)] ease-[var(--ease-spring)] hover:border-door active:scale-95";

/** One short question, a few tappable answers, a voice answer. Never blocks anything else. */
export function QuestionCard({ task, busy, onAnswer, onVoice, onDismiss, onVoiceError }: Props) {
  const { t } = useI18n();
  const [other, setOther] = useState(false);
  const [time, setTime] = useState("");
  const rec = useRecorder({ onRecorded: onVoice, onError: onVoiceError });
  const recording = rec.state !== "idle";
  const needs = task.needs!;
  const text = questionText(needs, t);

  return (
    <div
      role="group"
      aria-label={text}
      className="question bg-sun/20 mx-2 mb-2 space-y-2.5 rounded-[14px] p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p data-bidi className="font-medium">
          {text}
        </p>
        <button
          onClick={onDismiss}
          aria-label={t("q.notNow")}
          title={t("q.notNow")}
          className="text-ink-2 hover:bg-ink/10 -m-1.5 grid size-9 shrink-0 place-items-center rounded-full"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      {busy ? (
        <p className="t-small text-ink-2" role="status">
          {t("q.thinking")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {quickAnswers(needs).map((a) => (
            <button key={a.id} onClick={() => onAnswer(a.answer)} className={chip}>
              <span dir={a.literal ? "ltr" : undefined}>{a.literal ?? t(a.labelKey!, a.vars)}</span>
            </button>
          ))}
          <button onClick={() => setOther((o) => !o)} aria-expanded={other} className={chip}>
            {t("q.other")}
          </button>
          <button
            onClick={() => (recording ? rec.stop() : void rec.start())}
            aria-label={recording ? t("q.stopVoice") : t("q.voice")}
            title={recording ? t("q.stopVoice") : t("q.voice")}
            className={`text-door-ink grid size-10 place-items-center rounded-full ${
              recording ? "mic-live bg-danger" : "bg-door"
            }`}
          >
            {recording ? <StopIcon width={18} height={18} /> : <MicIcon width={20} height={20} />}
          </button>
        </div>
      )}

      {needs.reason === "anchor" && /prayer_/.test(needs.word ?? "") && !busy && (
        <Link
          href="/settings#prayer"
          className="t-small text-door inline-block font-medium underline underline-offset-4"
        >
          {t("q.prayerCity")}
        </Link>
      )}

      {other && !busy && (
        <div className="flex items-center gap-2">
          <input
            type="time"
            aria-label={t("q.other")}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-field bg-surface focus:ring-door px-3 py-2 outline-none focus:ring-2"
          />
          <button
            disabled={!time}
            onClick={() => onAnswer({ kind: "clock", time })}
            className={`${chip} disabled:opacity-40`}
          >
            {t("q.set")}
          </button>
        </div>
      )}
    </div>
  );
}
