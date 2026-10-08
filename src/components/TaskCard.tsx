"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useI18n } from "@/lib/i18n";
import type { Task } from "@/lib/schemas";
import { isOverdue } from "@/lib/tasks/filters";
import { describeFact } from "@/lib/questions/describe";
import { formatDue, leadLabel } from "@/lib/time/format";
import { formatRemaining } from "@/lib/time/remaining";
import { formatItem, stepsDone } from "@/lib/tasks/items";
import { CheckIcon, GripIcon, TrashIcon } from "./Icon";

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
  /** Completed in a list it no longer belongs to: fades out. Not in the Done list, where it stays. */
  finishing?: boolean;
  /** Several cards are being picked (to delete together): a tap picks or unpicks instead of opening. */
  selecting?: boolean;
  selected?: boolean;
  /** Held down for a moment: starts picking, with this card. */
  onLongPress?: (id: string) => void;
  onSelect?: (id: string) => void;
  /** Swiped with a finger: right finishes the task (or reopens it in the Done list), left deletes it. */
  onSwipe?: (id: string, action: SwipeAction) => void;
}

export type SwipeAction = "toggle" | "delete";

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10; // moving further than this is a scroll or a drag, not a press
const SWIPE_START_PX = 12; // sideways travel before the card starts to follow the finger
const SWIPE_COMMIT = 0.33; // share of the card's width that must be crossed to act
const FLICK_PX = 48; // a quick flick acts sooner: at least this far...
const FLICK_SPEED = 0.6; // ...at this many px per ms
const FLING_MS = 180;

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
            {task.recurrence && !task.done && (
              <span data-testid="repeats">{t(`task.repeat.${task.recurrence.freq}`)}</span>
            )}
            {task.remindBefore && task.dueAt && !task.done && (
              <span data-testid="remind-before">
                {t("task.remindBefore", { when: leadLabel(task.remindBefore, t) })}
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
export function TaskCard({
  draggable,
  leaving,
  settled,
  finishing,
  selecting,
  selected,
  onLongPress,
  onSelect,
  onSwipe,
  ...body
}: Props) {
  const { t } = useI18n();
  const { id } = body.task;
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const touch = useRef(false);
  const swipe = useRef<{ x: number; y: number; at: number; width: number; on: boolean } | null>(
    null,
  );
  /** How far the card has been pulled sideways, in px. Positive is to the right, in every language. */
  const [dx, setDx] = useState(0);
  /** Let go past the commit point: the card flies off that side before the action runs. */
  const [flung, setFlung] = useState<-1 | 0 | 1>(0);
  const [width, setWidth] = useState(1);
  const flingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const pending = flingTimers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  const past = Math.abs(dx) > width * SWIPE_COMMIT;
  // Swiped to done, then the list changed under it (straight to the Done tab): the same card is now
  // staying, so it must not remain off to the side.
  const [wasFinishing, setWasFinishing] = useState(finishing);
  if (wasFinishing !== finishing) {
    setWasFinishing(finishing);
    if (!finishing) {
      setFlung(0);
      setDx(0);
    }
  }

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  useEffect(() => cancelPress, []);

  function onPointerDown(e: React.PointerEvent) {
    touch.current = e.pointerType === "touch";
    longPressed.current = false;
    // The grip is for dragging; a second finger or a right click is not a press.
    if (selecting || e.button > 0 || !e.isPrimary) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-grip]")) return;
    // Swiping is for fingers, and not across the question below the card (it has its own controls).
    if (onSwipe && touch.current && !flung && !target.closest("[role=group]")) {
      const w = e.currentTarget.getBoundingClientRect().width;
      swipe.current = { x: e.clientX, y: e.clientY, at: e.timeStamp, width: w, on: false };
      setWidth(w);
    }
    if (!onLongPress) return;
    cancelPress();
    press.current = {
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        press.current = null;
        longPressed.current = true;
        navigator.vibrate?.(15);
        onLongPress(id);
      }, LONG_PRESS_MS),
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP_PX) cancelPress();

    const s = swipe.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.on) {
      // Mostly up or down is a scroll: leave it to the page.
      if (Math.abs(my) > SWIPE_START_PX && Math.abs(my) >= Math.abs(mx)) return void endSwipe();
      if (Math.abs(mx) < SWIPE_START_PX || Math.abs(mx) < Math.abs(my) * 1.5) return;
      s.on = true;
      cancelPress();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer is already gone: the card just stops following */
      }
    }
    const wasPast = Math.abs(dx) > s.width * SWIPE_COMMIT;
    if (Math.abs(mx) > s.width * SWIPE_COMMIT !== wasPast) navigator.vibrate?.(10); // crossing the line
    setDx(mx);
  }

  function endSwipe() {
    swipe.current = null;
    setDx(0);
  }

  function onPointerUp(e: React.PointerEvent) {
    cancelPress();
    const s = swipe.current;
    if (!s?.on) return void (swipe.current = null);
    longPressed.current = true; // swallow the click that follows the finger lifting
    const mx = e.clientX - s.x;
    const quick =
      Math.abs(mx) > FLICK_PX && Math.abs(mx) / Math.max(1, e.timeStamp - s.at) > FLICK_SPEED;
    if (Math.abs(mx) <= s.width * SWIPE_COMMIT && !quick) return endSwipe(); // springs back
    swipe.current = null;
    setFlung(mx > 0 ? 1 : -1);
    // Act at once (the card lingers long enough to be seen flying off): a delayed action could be lost.
    onSwipe?.(id, mx > 0 ? "toggle" : "delete");
    flingTimers.current.push(
      // If the card is still here afterwards (the action was undone), it is back in place.
      setTimeout(() => {
        setFlung(0);
        setDx(0);
      }, FLING_MS + 600),
    );
  }

  // Runs before the buttons inside: while picking, the whole card is one target.
  function onClickCapture(e: React.MouseEvent) {
    if (longPressed.current) {
      longPressed.current = false; // the click that ends the long press itself
    } else if (selecting) {
      onSelect?.(id);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }

  // A tap anywhere that is not a control of its own opens the editor.
  function onClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [role=group]"))
      return;
    body.onOpen(id);
  }

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
      data-grip
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
      data-selected={selected || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        cancelPress();
        endSwipe();
      }}
      onPointerLeave={cancelPress}
      onContextMenu={(e) => {
        // On a phone a long press also asks for the context menu; the press already has a meaning here.
        if (touch.current) e.preventDefault();
      }}
      onClickCapture={onClickCapture}
      onClick={onClick}
      className={`${cardClass(body.task)} card-in relative cursor-pointer touch-pan-y overflow-hidden select-none [-webkit-touch-callout:none] ${
        isDragging ? "drag-ghost" : ""
      } ${leaving ? "card-out" : finishing ? "card-done-out" : ""} ${
        settled ? "drop-settle" : ""
      } ${selected ? "ring-door ring-2" : ""}`}
    >
      {(dx !== 0 || flung !== 0) && (
        // What letting go will do, shown behind the card. Laid out left-to-right in every language:
        // the directions of the gesture do not flip.
        <div
          aria-hidden
          dir="ltr"
          data-swipe={dx > 0 || flung > 0 ? "toggle" : "delete"}
          className={`absolute inset-0 flex items-center px-6 ${
            dx > 0 || flung > 0
              ? "bg-door text-door-ink justify-start"
              : "bg-danger text-paper justify-end"
          }`}
        >
          <span
            className={`transition-transform duration-[var(--t-fast)] ease-[var(--ease-spring)] ${
              past || flung ? "scale-125" : "scale-90 opacity-70"
            }`}
          >
            {dx > 0 || flung > 0 ? <CheckIcon className="size-6" /> : <TrashIcon />}
          </span>
        </div>
      )}
      <div
        className="bg-surface relative"
        style={{
          transform: flung ? `translateX(${flung * 110}%)` : dx ? `translateX(${dx}px)` : undefined,
          // Follows the finger exactly; glides only when let go (off the side, or back into place).
          transition: flung || dx === 0 ? `transform ${FLING_MS}ms var(--ease-out)` : undefined,
        }}
      >
        <TaskCardBody {...body} grip={grip} />
      </div>
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
