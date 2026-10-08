"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { ApiError, parse, transcribe } from "../ai/client";
import { useI18n } from "../i18n";
import type { LearnResult } from "../memory/profile";
import type { FactSource } from "../memory/profile";
import type { Task } from "../schemas";
import { answerFromSpoken, factFromAnswer, resolveAnswer, type Answer } from "./answers";
import { askNow, dismiss, groupOf, reopen, resurfaceCandidates } from "./ask";
import { describeFact, questionText } from "./describe";

interface Deps {
  /** Jump to where the re-asked question lives. */
  onShowResurfaced: () => void;
  getTasks: () => Task[];
  upsert: (task: Task) => void;
  learn: (key: string, value: string, source: FactSource) => Promise<LearnResult | null>;
}

const MIN_AUDIO_MS = 500;

/** Everything that happens around a clarifying question: answering, voice, dismissing, re-asking. */
export function useAnswers({ getTasks, upsert, learn, onShowResurfaced }: Deps) {
  const onShowRef = useRef(onShowResurfaced);
  useEffect(() => {
    onShowRef.current = onShowResurfaced;
  });
  const { t, locale } = useI18n();
  const { show } = useToast();
  const [answering, setAnswering] = useState<string | null>(null); // group id being processed

  const answer = useCallback(
    async (task: Task, choice: Answer) => {
      const needs = task.needs;
      const group = groupOf(getTasks(), task);
      const at = resolveAnswer(choice, new Date()).toISOString();
      const before = group.slice();
      for (const g of group) {
        upsert({
          ...g,
          dueAt: at,
          reminders: [at],
          needs: null,
          assumed: null,
          updatedAt: new Date().toISOString(),
        });
      }
      const undo = { label: t("toast.undo"), run: () => before.forEach(upsert) };

      const fact = needs ? factFromAnswer(needs, choice) : null;
      const learned = fact ? await learn(fact.key, fact.value, "answer") : null;
      // The very first time a fact is saved, say so plainly.
      if (learned?.created)
        show({
          message: t("toast.learned", { fact: describeFact(learned.fact, t) }),
          action: undo,
        });
      else show({ message: t("toast.timeSet"), action: undo });
    },
    [getTasks, learn, show, t, upsert],
  );

  const answerByVoice = useCallback(
    async (task: Task, audio: Blob, durationMs: number) => {
      if (durationMs < MIN_AUDIO_MS) return show({ message: t("voice.tooShort") });
      const groupId = task.needs?.group ?? task.id;
      setAnswering(groupId);
      try {
        const text = await transcribe(audio);
        if (!text) return show({ message: t("voice.empty") });
        const result = await parse({
          text,
          locale,
          followUp: {
            taskTitle: task.title,
            question: task.needs ? questionText(task.needs, t) : t("q.generic"),
          },
        });
        const when = result.reminders[0]?.when;
        const choice = when ? answerFromSpoken(when, new Date()) : null;
        if (!choice) return show({ message: t("toast.unclear") });
        await answer(task, choice);
      } catch (e) {
        show({
          message: t(
            e instanceof ApiError && e.kind === "rate_limited"
              ? "capture.rateLimited"
              : "capture.transcribeFailed",
          ),
        });
      } finally {
        setAnswering(null);
      }
    },
    [answer, locale, show, t],
  );

  const dismissGroup = useCallback(
    (task: Task) => groupOf(getTasks(), task).forEach((g) => upsert(dismiss(g))),
    [getTasks, upsert],
  );

  /** Tapping the "Needs time" chip asks again on demand. */
  const askAgain = useCallback(
    (task: Task) => groupOf(getTasks(), task).forEach((g) => upsert(askNow(g, new Date()))),
    [getTasks, upsert],
  );

  /** Questions that were ignored come back once, a few hours later. */
  const resurface = useCallback(() => {
    const now = new Date();
    const due = resurfaceCandidates(getTasks(), now);
    if (!due.length) return;
    due.forEach((d) => upsert(reopen(d, now)));
    show({
      message: t("toast.resurfaced", { title: due[0].title }),
      action: { label: t("q.show"), run: () => onShowRef.current() },
    });
  }, [getTasks, show, t, upsert]);

  return { answer, answerByVoice, dismissGroup, askAgain, resurface, answering };
}
