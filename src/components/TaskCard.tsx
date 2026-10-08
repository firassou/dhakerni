"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useI18n } from "@/lib/i18n";
import type { Task } from "@/lib/schemas";
import { isOverdue } from "@/lib/tasks/filters";
import { formatDue } from "@/lib/time/format";
import { CheckIcon, GripIcon } from "./Icon";

interface Props {
  task: Task;
  now: Date;
  draggable: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}

export function TaskCard({ task, now, draggable, onToggle, onOpen }: Props) {
  const { t, locale } = useI18n();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !draggable });

  const overdue = isOverdue(task, now);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`card-in group rounded-card bg-surface flex items-center gap-1 ps-1 pe-1 ${
        isDragging ? "relative z-10 shadow-[var(--shadow-float)]" : ""
      } ${task.priority === "high" ? "border-s-door border-s-[3px]" : ""}`}
    >
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

      <button
        onClick={() => onOpen(task.id)}
        aria-label={`${t("task.edit")}: ${task.title}`}
        className="min-w-0 flex-1 py-3 text-start"
      >
        <span
          data-bidi
          className={`block transition-colors duration-[var(--t-base)] ${task.done ? "text-ink-2 line-through" : ""}`}
        >
          {task.title}
        </span>
        <span className="t-micro text-ink-2 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {task.dueAt ? (
            <span
              data-bidi
              className={`rounded-full px-2 py-0.5 ${
                overdue ? "bg-danger/15 text-danger" : "bg-sun/25 text-ink"
              }`}
            >
              {overdue ? `${t("time.overdue")} · ` : ""}
              {formatDue(task.dueAt, locale, now, t)}
            </span>
          ) : (
            !task.done && (
              <span className="border-ink-2/60 rounded-full border border-dashed px-2 py-0.5">
                {t("task.needsTime")}
              </span>
            )
          )}
          {task.list !== "inbox" && <span data-bidi>{task.list}</span>}
        </span>
      </button>

      {draggable && (
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("task.reorder")}
          className="text-ink-2/70 hover:text-ink grid size-11 shrink-0 cursor-grab touch-none place-items-center active:cursor-grabbing"
        >
          <GripIcon />
        </button>
      )}
    </li>
  );
}
