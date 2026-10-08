"use client";

import { useCallback, useState } from "react";
import { useToast, useUndoToast } from "@/components/Toast";
import { useI18n } from "@/lib/i18n";
import type { Task } from "@/lib/schemas";
import type { LearnedOptions } from "@/lib/memory/profile";
import { mergeIntoOpenLists, openListHint } from "@/lib/tasks/items";
import { newTask } from "@/lib/tasks/ops";
import { ApiError, parse, transcribe } from "./client";
import { toTasks } from "./apply";
import { applyEdits, editCandidates, toOpenTasks } from "./edits";

const MIN_AUDIO_MS = 500;

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
    (created: Task[], changed: Task[] = [], before: Task[] = []) => {
      if (created.length) {
        insert(created);
        onCreated(created);
      }
      changed.forEach(upsert);
      const message = created.length
        ? created.length === 1
          ? t("toast.added")
          : t("capture.addedMany", { count: created.length })
        : changed.length === 1
          ? t("capture.updated", { title: changed[0].title })
          : t("capture.updatedMany", { count: changed.length });
      undoToast(message, () => {
        created.forEach((c) => remove(c.id));
        before.forEach(upsert);
      });
    },
    [insert, onCreated, remove, t, undoToast, upsert],
  );

  const submitText = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      setPending({ text: clean });
      try {
        // Open tasks that share a word with the sentence: it may be about one of them, not a new task.
        const candidates = editCandidates(clean, getTasks());
        const listHint = openListHint(getTasks());
        const result = await parse({
          text: clean,
          locale,
          hints: [...hintsFor(clean), ...(listHint ? [listHint] : [])].slice(0, 6),
          openTasks: toOpenTasks(candidates),
        });
        const now = new Date();
        const options = getResolveOptions();
        const edited = applyEdits(result, candidates, now, options);
        const editedById = new Map(edited.map((e) => [e.id, e]));
        const current = getTasks().map((x) => editedById.get(x.id) ?? x);
        // Things named for a list that is already open go onto that list.
        const { grown, fresh } = mergeIntoOpenLists(
          toTasks(result, now, current, options),
          current,
        );
        grown.forEach((g) => editedById.set(g.id, g));
        const changed = [...editedById.values()];
        if (fresh.length === 0 && changed.length === 0) show({ message: t("voice.noTask") });
        else {
          const ids = new Set(changed.map((c) => c.id));
          finish(
            fresh,
            changed,
            getTasks().filter((x) => ids.has(x.id)),
          );
        }
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

  /**
   * Audio in, words out. The transcript is handed back, not turned into tasks: speech-to-text gets Derja
   * wrong often enough that the person checks (and fixes) what was heard before it is understood.
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
      show({ message: t("voice.review") });
      return text;
    },
    [show, t],
  );

  return { pending, submitText, hear };
}
