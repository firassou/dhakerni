"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useI18n } from "@/lib/i18n";
import type { Task } from "@/lib/schemas";
import { fromLocalInput, toLocalInput } from "@/lib/time/format";
import { CloseIcon, TrashIcon } from "./Icon";
import {
  DecisionSection,
  ItemsSection,
  StepsSection,
  SuggestionsSection,
  type Edit,
} from "./TaskDetails";

const PRIORITIES = ["low", "normal", "high"] as const;

const field =
  "w-full rounded-field bg-surface-2 px-3 py-3 outline-none focus:ring-2 focus:ring-door";

interface Props {
  task: Task | null;
  onClose: () => void;
  onChange: (id: string, patch: Partial<Task>) => void;
  onDelete: (task: Task) => void;
  /** Where focus goes on close: the button that opened the editor. */
  onCloseAutoFocus?: (e: Event) => void;
}

/** Edits apply live: nothing to confirm, so nothing to lose. */
export function TaskEditor({ task, onClose, onChange, onDelete, onCloseAutoFocus }: Props) {
  const { t } = useI18n();

  /** Each section computes the next task; we save only the parts those sections own. */
  const edit: Edit = (fn) => {
    if (!task) return;
    const next = fn(task);
    onChange(task.id, {
      items: next.items,
      subtasks: next.subtasks,
      suggestions: next.suggestions,
      decision: next.decision,
    });
  };

  return (
    <Dialog.Root open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay bg-ink/40 fixed inset-0 z-40" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={onCloseAutoFocus}
          className="sheet bg-paper fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[28px] p-5 pb-[max(20px,env(safe-area-inset-bottom))] outline-none sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-[28px]"
        >
          {task && (
            <>
              <div className="flex items-center justify-between">
                <Dialog.Title className="t-lead">{t("editor.title")}</Dialog.Title>
                <Dialog.Close
                  aria-label={t("editor.close")}
                  className="text-ink-2 hover:bg-surface-2 grid size-11 place-items-center rounded-full"
                >
                  <CloseIcon />
                </Dialog.Close>
              </div>

              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="t-small text-ink-2 mb-1 block">{t("editor.name")}</span>
                  <input
                    data-bidi
                    className={field}
                    value={task.title}
                    onChange={(e) => onChange(task.id, { title: e.target.value })}
                  />
                </label>

                <div>
                  <label htmlFor="due" className="t-small text-ink-2 mb-1 block">
                    {t("editor.due")}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="due"
                      type="datetime-local"
                      className={field}
                      value={toLocalInput(task.dueAt)}
                      onChange={(e) => {
                        const dueAt = fromLocalInput(e.target.value);
                        onChange(task.id, { dueAt, reminders: dueAt ? [dueAt] : [] });
                      }}
                    />
                    {task.dueAt && (
                      <button
                        onClick={() => onChange(task.id, { dueAt: null, reminders: [] })}
                        className="t-small rounded-field text-ink-2 hover:bg-surface-2 shrink-0 px-3"
                      >
                        {t("editor.clearTime")}
                      </button>
                    )}
                  </div>
                </div>

                <fieldset>
                  <legend className="t-small text-ink-2 mb-1">{t("editor.priority")}</legend>
                  <div className="rounded-field bg-surface-2 flex gap-1 p-1">
                    {PRIORITIES.map((p) => (
                      <label
                        key={p}
                        className="t-small has-[:checked]:bg-surface has-[:focus-visible]:outline-door flex-1 cursor-pointer rounded-[9px] py-2 text-center transition-colors has-[:checked]:font-medium has-[:focus-visible]:outline-2"
                      >
                        <input
                          type="radio"
                          name="priority"
                          className="sr-only"
                          checked={task.priority === p}
                          onChange={() => onChange(task.id, { priority: p })}
                        />
                        {t(`task.priority.${p}`)}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="block">
                  <span className="t-small text-ink-2 mb-1 block">{t("editor.list")}</span>
                  <input
                    data-bidi
                    className={field}
                    value={task.list}
                    onChange={(e) => onChange(task.id, { list: e.target.value || "inbox" })}
                  />
                </label>

                <label className="block">
                  <span className="t-small text-ink-2 mb-1 block">{t("editor.notes")}</span>
                  <textarea
                    data-bidi
                    rows={3}
                    className={`${field} resize-none`}
                    value={task.notes}
                    onChange={(e) => onChange(task.id, { notes: e.target.value })}
                  />
                </label>

                <DecisionSection task={task} edit={edit} />
                <ItemsSection task={task} edit={edit} />
                <StepsSection task={task} edit={edit} />
                <SuggestionsSection task={task} edit={edit} />

                <button
                  onClick={() => onDelete(task)}
                  className="rounded-field text-danger hover:bg-danger/10 flex w-full items-center justify-center gap-2 py-3"
                >
                  <TrashIcon className="size-5" />
                  {t("editor.delete")}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
