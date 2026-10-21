"use client";

import { useCallback, useState } from "react";
import { useToast, useUndoToast } from "@/components/Toast";
import { useI18n } from "@/lib/i18n";
import type { Task } from "@/lib/schemas";
import type { LearnedOptions } from "@/lib/memory/profile";
import { getOnline } from "@/lib/net/online";
import { deliverAssigned, getPairing } from "@/lib/partner/partner";
import { newTask } from "@/lib/tasks/ops";
import { ApiError, transcribe } from "./client";
import { understand } from "./understand";

const MIN_AUDIO_MS = 500;

/** What a sentence did: the tasks it made, the ones it changed, and a way to take it all back. */
export interface CaptureOutcome {
  created: Task[];
  changed: Task[];
  undo: () => void;
}

interface SubmitOptions {
  /** The caller shows the outcome itself (with its own Undo), so no toast. */
  quiet?: boolean;
}

interface Deps {
  getTasks: () => Task[];
  insert: (tasks: Task[]) => void;
  remove: (id: string) => void;
  upsert: (task: Task) => void;
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
  upsert,
  onCreated,
  getResolveOptions,
  hintsFor,
}: Deps) {
  const { t, locale } = useI18n();
  const { show } = useToast();
  const undoToast = useUndoToast();
  const [pending, setPending] = useState<{ text: string | null } | null>(null);

  /**
   * `changed` are tasks the person already had that this sentence altered (finished, moved, a list that
   * grew); `before` is how they looked, so one Undo puts everything back.
   */
  const finish = useCallback(
    (
      created: Task[],
      changed: Task[] = [],
      before: Task[] = [],
      options: SubmitOptions = {},
    ): CaptureOutcome => {
      if (created.length) {
        insert(created);
        onCreated(created);
      }
      changed.forEach(upsert);
      if (created.some((c) => c.assignedTo === "partner")) {
        // Said for the partner: send it. If that cannot be done it stays here as the person's own.
        void deliverAssigned(created).then(async ({ sent, failed }) => {
          sent.forEach(upsert);
          failed.forEach(upsert);
          if (failed.length) return show({ message: t("partner.assignFailed") });
          const name = (await getPairing())?.name;
          show({ message: name ? t("partner.assignedTo", { name }) : t("partner.assigned") });
        });
      }
      const undo = () => {
        created.forEach((c) => remove(c.id));
        before.forEach(upsert);
      };
      if (options.quiet) return { created, changed, undo };
      const message = created.length
        ? created.length === 1
          ? t("toast.added")
          : t("capture.addedMany", { count: created.length })
        : changed.length === 1
          ? t("capture.updated", { title: changed[0].title })
          : t("capture.updatedMany", { count: changed.length });
      undoToast(message, undo);
      return { created, changed, undo };
    },
    [insert, onCreated, remove, show, t, undoToast, upsert],
  );

  const submitText = useCallback(
    async (text: string, options: SubmitOptions = {}): Promise<CaptureOutcome | null> => {
      const clean = text.trim();
      if (!clean) return null;
      // No network: keep the words now, and the AI fills in the rest when it is back (useAiBackfill).
      if (!getOnline()) {
        const saved = finish(
          [newTask(clean, getTasks(), new Date(), { aiPending: true })],
          [],
          [],
          options,
        );
        show({ message: t("capture.offlineSaved") });
        return saved;
      }
      setPending({ text: clean });
      try {
        const { fresh, changed, before } = await understand(clean, {
          tasks: getTasks(),
          locale,
          hints: hintsFor(clean),
          options: getResolveOptions(),
        });
        if (fresh.length === 0 && changed.length === 0) {
          if (!options.quiet) show({ message: t("voice.noTask") });
          return { created: [], changed: [], undo: () => {} };
        }
        return finish(fresh, changed, before, options);
      } catch (e) {
        // Keep the words: save them as a plain task with no time.
        const offline = e instanceof ApiError && e.kind === "network";
        const saved = finish(
          [newTask(clean, getTasks(), new Date(), { aiPending: offline })],
          [],
          [],
          options,
        );
        show({
          message: t(
            offline
              ? "capture.offlineSaved"
              : e instanceof ApiError && e.kind === "rate_limited"
                ? "capture.rateLimited"
                : "capture.fallback",
          ),
        });
        return saved;
      } finally {
        setPending(null);
      }
    },
    [finish, getResolveOptions, getTasks, hintsFor, locale, show, t],
  );

  /**
   * Audio in, words out. The caller shows the words, then understands them: speech-to-text gets Derja
   * wrong often enough that the person must be able to see what was heard and fix a word.
   */
  const hear = useCallback(
    async (audio: Blob, durationMs: number): Promise<string | null> => {
      if (durationMs < MIN_AUDIO_MS) {
        show({ message: t("voice.tooShort") });
        return null;
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
        return null;
      }
      setPending(null);
      if (!text) {
        show({ message: t("voice.empty") });
        return null;
      }
      return text;
    },
    [show, t],
  );

  return { pending, submitText, hear };
}
