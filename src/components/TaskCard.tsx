"use client";

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useI18n } from "@/lib/i18n";
import type { Task } from "@/lib/schemas";
import { isOverdue } from "@/lib/tasks/filters";
import { describeFact } from "@/lib/questions/describe";
import { formatDue } from "@/lib/time/format";
import { formatRemaining } from "@/lib/time/remaining";
import { formatItem, stepsDone } from "@/lib/tasks/items";
import { CheckIcon, GripIcon } from "./Icon";

interface BodyProps {
  task: Task;
  now: Date;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onAsk: (id: string) => void;
  onItemToggle: (taskId: string, itemId: string) => void;
  /** The open clarifying question, when this task is its first in the list. */
  footer?: ReactNode;
  /** The drag handle (or its stand-in on the lifted copy). */
  grip?: ReactNode;
}

interface Props extends Omit<BodyProps, "grip"> {
  draggable: boolean;
  /** Being deleted: plays its exit animation before it is removed. */
  leaving?: boolean;
  /** Just dropped after a drag: shows a brief settle highlight. */
  settled?: boolean;
}

const MAX_CHIPS = 4;

/** Everything a task card shows. Pure view: no drag logic, so the lifted copy can reuse it. */
function TaskCardBody({
  task,
  now,
  onToggle,
  onOpen,
  onAsk,
  onItemToggle,
  footer,
  grip,
}: BodyProps) {
  const { t, locale } = useI18n();
  const overdue = isOverdue(task, now);
  const remaining = task.dueAt && !task.done ? formatRemaining(task.dueAt, now, locale) : null;
  const showDescription =
    !!task.notes.trim() &&
    !task.done &&
    task.notes.trim().toLowerCase() !== task.title.trim().toLowerCase();
  const askable = !task.done && !task.dueAt && task.needs && task.needs.reason !== "none";

  return (
    <>
      <div className="flex items-center gap-1 ps-1 pe-1">
        <button
          onClick={() => onToggle(task.id)}
          aria-label={task.done ? t("task.markUndone") : t("task.markDone")}
          aria-pressed={task.done}
          className="grid size-12 shrink-0 place-items-center"
        >
          <span
            className={`grid size-6 place-items-center rounded-full border-2 transition-all duration-[var(--t-base)] ease-[var(--ease-spring)] ${
              task.done
                ? "border-door bg-door text-door-ink scale-110"
                : "border-ink-2/50 group-hover:border-door"
            }`}
          >
            <CheckIcon className={`check size-4 ${task.done ? "check-on" : ""}`} />
          </span>
        </button>

        <div className="min-w-0 flex-1 py-2.5">
          <button
            onClick={() => onOpen(task.id)}
            aria-label={`${t("task.edit")}: ${task.title}`}
            className="block w-full text-start"
          >
            <span
              data-bidi
              className={`block transition-colors duration-[var(--t-base)] ${task.done ? "text-ink-2 line-through" : ""}`}
            >
              {task.title}
            </span>
          </button>
          {showDescription && (
            <p data-bidi className="t-small text-ink-2 mt-0.5 line-clamp-2">
              {task.notes}
            </p>
          )}
          {task.items.length > 0 && !task.done && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {task.items.slice(0, MAX_CHIPS).map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => onItemToggle(task.id, item.id)}
                    aria-pressed={item.done}
                    aria-label={t(item.done ? "task.uncheckItem" : "task.checkItem", {
                      item: item.name,
                    })}
                    data-bidi
                    className={`t-small rounded-full border px-2.5 py-1 transition-colors duration-[var(--t-fast)] ${
                      item.done
                        ? "bg-surface-2 text-ink-2 border-transparent line-through"
                        : "border-ink/15 hover:border-door"
                    }`}
                  >
                    {formatItem(item, locale)}
                  </button>
                </li>
              ))}
              {task.items.length > MAX_CHIPS && (
                <li className="t-small text-ink-2 self-center">
                  {t("task.moreItems", { n: task.items.length - MAX_CHIPS })}
                </li>
              )}
            </ul>
          )}
          {task.decision && !task.done && (
            <p data-bidi className="t-small text-ink-2 mt-1">
              <span className="bg-sun/30 text-ink me-1.5 rounded-full px-2 py-0.5 font-medium">
                {t("task.decisionBadge")}
              </span>
              {task.decision.chosen
                ? t("task.chosenLabel", { option: task.decision.chosen })
                : task.decision.recommendation
                  ? `${t("task.suggestionLabel")}: ${task.decision.recommendation}`
                  : null}
            </p>
          )}
          <span className="t-micro text-ink-2 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {task.dueAt ? (
              <span
                data-bidi
                className={`rounded-full px-2 py-0.5 ${overdue ? "bg-danger/15 text-danger" : "bg-sun/25 text-ink"}`}
              >
                {overdue ? `${t("time.overdue")} · ` : ""}
                {formatDue(task.dueAt, locale, now, t)}
              </span>
            ) : askable ? (
              <button
                onClick={() => onAsk(task.id)}
                className="border-ink-2/60 hover:border-door hover:text-ink rounded-full border border-dashed px-2 py-0.5"
              >
                {t("task.needsTime")}
              </button>
            ) : (
              !task.done && (
                <span className="border-ink-2/60 rounded-full border border-dashed px-2 py-0.5">
                  {t("task.needsTime")}
                </span>
              )
            )}
            {remaining && (
              <span data-testid="remaining" data-bidi>
                {remaining}
              </span>
            )}
            {task.assumed && task.dueAt && (
              <button
                onClick={() => onOpen(task.id)}
                title={t("task.assumedHint")}
                aria-label={`${describeFact(task.assumed, t)}. ${t("task.assumedHint")}`}
                data-bidi
                className="bg-door-soft text-door hover:bg-door/20 rounded-full px-2 py-0.5"
              >
                {describeFact(task.assumed, t)}
              </button>
            )}
            {task.subtasks.length > 0 && (
              <span>
                {t("task.stepsProgress", { done: stepsDone(task), total: task.subtasks.length })}
              </span>
            )}
            {task.list !== "inbox" && <span data-bidi>{task.list}</span>}
          </span>
        </div>

        {grip}
      </div>
      {footer}
    </>
  );
}

const cardClass = (task: Task) =>
  `group rounded-card bg-surface ${task.priority === "high" ? "border-s-door border-s-[3px]" : ""}`;

/** The card in the list. While it is being dragged it stays behind as a dashed placeholder. */
export function TaskCard({ draggable, leaving, settled, ...body }: Props) {
  const { t } = useI18n();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: body.task.id,
    disabled: !draggable,
    // Neighbours glide out of the way instead of jumping.
    transition: { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  });

  const grip = draggable ? (
    <button
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={t("task.reorder")}
      className="text-ink-2/70 hover:text-ink grid size-11 shrink-0 cursor-grab touch-none place-items-center active:cursor-grabbing"
    >
      <GripIcon />
    </button>
  ) : null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-dragging={isDragging || undefined}
      className={`${cardClass(body.task)} card-in ${isDragging ? "drag-ghost" : ""} ${
        leaving ? "card-out" : body.task.done ? "card-done-out" : ""
      } ${settled ? "drop-settle" : ""}`}
    >
      <TaskCardBody {...body} grip={grip} />
    </li>
  );
}

/** The copy that is lifted and follows the pointer while dragging. */
export function TaskCardOverlay(body: Omit<BodyProps, "grip">) {
  return (
    <div data-drag-overlay className={`${cardClass(body.task)} drag-lift`}>
      <TaskCardBody
        {...body}
        grip={
          <span
            aria-hidden
            className="text-door grid size-11 shrink-0 cursor-grabbing place-items-center"
          >
            <GripIcon />
          </span>
        }
      />
    </div>
  );
}
