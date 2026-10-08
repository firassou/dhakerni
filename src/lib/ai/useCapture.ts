"use client";

import { useCallback, useState } from "react";
import { useToast, useUndoToast } from "@/components/Toast";
import { useI18n } from "@/lib/i18n";
import type { Task } from "@/lib/schemas";
import type { LearnedOptions } from "@/lib/memory/profile";
import { newTask } from "@/lib/tasks/ops";
import { ApiError, parse, transcribe } from "./client";
import { toTasks } from "./apply";

const MIN_AUDIO_MS = 500;

interface Deps {
  getTasks: () => Task[];
  insert: (tasks: Task[]) => void;
  remove: (id: string) => void;
  onCreated: (tasks: Task[]) => void;
  /** Learned meanings, so known words resolve silently. */
  getResolveOptions: () => LearnedOptions;
  hintsFor: (text: string) => string[];
}

/** Text or audio in; tasks out. Never blocks: any failure still saves what the person said. */
export function useCapture({
  getTasks,
  insert,
  remove,
  onCreated,
  getResolveOptions,
  hintsFor,
}: Deps) {
  const { t, locale } = useI18n();
  const { show } = useToast();
  const undoToast = useUndoToast();
  const [pending, setPending] = useState<{ text: string | null } | null>(null);

  const finish = useCallback(
    (created: Task[]) => {
      insert(created);
      onCreated(created);
      const message =
        created.length === 1 ? t("toast.added") : t("capture.addedMany", { count: created.length });
      undoToast(message, () => created.forEach((c) => remove(c.id)));
    },
    [insert, onCreated, remove, t, undoToast],
  );

  const submitText = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      setPending({ text: clean });
      try {
        const result = await parse({ text: clean, locale, hints: hintsFor(clean) });
        const created = toTasks(result, new Date(), getTasks(), getResolveOptions());
        if (created.length === 0) show({ message: t("voice.noTask") });
        else finish(created);
      } catch (e) {
        // Keep the words: save them as a plain task with no time.
        finish([newTask(clean, getTasks(), new Date())]);
        show({
          message: t(
            e instanceof ApiError && e.kind === "rate_limited"
              ? "capture.rateLimited"
              : "capture.fallback",
          ),
        });
      } finally {
        setPending(null);
      }
    },
    [finish, getResolveOptions, getTasks, hintsFor, locale, show, t],
  );

  const submitAudio = useCallback(
    async (audio: Blob, durationMs: number) => {
      if (durationMs < MIN_AUDIO_MS) {
        show({ message: t("voice.tooShort") });
        return;
      }
      setPending({ text: null });
      let text: string;
      try {
        text = await transcribe(audio);
      } catch (e) {
        setPending(null);
        show({
          message: t(
            e instanceof ApiError && e.kind === "rate_limited"
              ? "capture.rateLimited"
              : "capture.transcribeFailed",
          ),
        });
        return;
      }
      if (!text) {
        setPending(null);
        show({ message: t("voice.empty") });
        return;
      }
      await submitText(text);
    },
    [show, submitText, t],
  );

  return { pending, submitText, submitAudio };
}
