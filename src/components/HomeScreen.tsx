"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSessionId } from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import type { Task } from "@/lib/schemas";
import { useCapture } from "@/lib/ai/useCapture";
import { usePush, syncToServer } from "@/lib/push/usePush";
import { ANCHOR_CHOICES } from "@/lib/questions/answers";
import {
  anchorsWaiting,
  DEFAULT_SNOOZE_MIN,
  roundedClock,
  triggerable,
  upcomingReminders,
} from "@/lib/reminders/engine";
import { useReminders } from "@/lib/reminders/useReminders";
import { useProfile } from "@/lib/memory/useProfile";
import { isQuestionOpen } from "@/lib/questions/ask";
import { useAnswers } from "@/lib/questions/useAnswers";
import { matchesFilter, selectTasks, type Filter } from "@/lib/tasks/filters";
import { useTasks } from "@/lib/tasks/useTasks";
import { Dock } from "./Dock";
import { FilterTabs } from "./FilterTabs";
import { Mark, SlidersIcon } from "./Icon";
import { PushBanner } from "./PushBanner";
import { QuestionCard } from "./QuestionCard";
import { ReminderAlerts } from "./ReminderAlerts";
import { TaskCard } from "./TaskCard";
import { TaskEditor } from "./TaskEditor";
import { TriggerBar } from "./TriggerBar";
import { useToast, useUndoToast } from "./Toast";

const LINGER_MS = 450;

export function HomeScreen() {
  const { t } = useI18n();
  const undoToast = useUndoToast();
  const { tasks, ready, reload, insert, getTasks, update, toggle, remove, upsert, move } =
    useTasks();
  const { show } = useToast();
  const { facts, learn, getResolveOptions } = useProfile();
  const push = usePush();
  const [filter, setFilter] = useState<Filter>("today");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  // Tasks just completed stay visible briefly so the check animation can play.
  const [lingering, setLingering] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const resurfaceRef = useRef<() => void>(() => {});

  useEffect(() => {
    getSessionId().catch(() => {});
    const tick = setInterval(() => {
      setNow(new Date());
      resurfaceRef.current();
    }, 30_000);
    const pending = timers.current;
    return () => {
      clearInterval(tick);
      pending.forEach(clearTimeout);
    };
  }, []);

  const visible = useMemo(() => {
    const base = selectTasks(tasks, filter, now);
    if (!lingering.size) return base;
    const have = new Set(base.map((x) => x.id));
    const extra = tasks.filter((x) => lingering.has(x.id) && !have.has(x.id));
    return filter === "done"
      ? [...base, ...extra]
      : [...base, ...extra].sort((a, b) => a.order - b.order);
  }, [tasks, filter, now, lingering]);

  const handleToggle = useCallback(
    (id: string) => {
      const wasDone = tasks.find((x) => x.id === id)?.done ?? false;
      setLingering((s) => new Set(s).add(id));
      timers.current.push(
        setTimeout(
          () =>
            setLingering((s) => {
              const n = new Set(s);
              n.delete(id);
              return n;
            }),
          LINGER_MS,
        ),
      );
      toggle(id);
      if (!wasDone) undoToast(t("toast.done"), () => toggle(id));
    },
    [tasks, toggle, undoToast, t],
  );

  const { pending, submitText, submitAudio } = useCapture({
    getTasks,
    insert,
    remove,
    getResolveOptions,
    // Jump to the view where the first new task lives, so it is visible straight away.
    onCreated: (created) => {
      const at = new Date();
      const view = (["today", "upcoming", "needsTime"] as const).find((f) =>
        matchesFilter(created[0], f, at),
      );
      if (view) setFilter(view);
    },
  });

  const { answer, answerByVoice, dismissGroup, askAgain, resurface, answering } = useAnswers({
    getTasks,
    upsert,
    learn,
    onShowResurfaced: () => setFilter("needsTime"),
  });

  const snoozeMinutes =
    Number(facts.find((f) => f.key === "snooze.default")?.value) || DEFAULT_SNOOZE_MIN;
  const reminders = useReminders({ tasks, getTasks, ready, upsert, toggle, snoozeMinutes });

  const focusReminder = reminders.focus;

  // The service worker changes tasks from notification buttons; pick those changes up.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "tasks-changed") void reload();
      if (e.data?.type === "focus-task" && e.data.taskId) focusReminder(e.data.taskId);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [reload, focusReminder]);

  // Opened from a notification click: /?task=ID shows that reminder.
  useEffect(() => {
    if (!ready) return;
    const id = new URLSearchParams(location.search).get("task");
    if (!id) return;
    focusReminder(id);
    history.replaceState(null, "", "/");
  }, [ready, focusReminder]);

  // Keep the server's copy of future reminders in step with the tasks (only when notifications are on).
  useEffect(() => {
    if (!ready || push.state !== "enabled") return;
    const id = setTimeout(() => {
      syncToServer(upcomingReminders(tasks, new Date())).catch((e) =>
        console.error("reminder sync failed", e),
      );
    }, 1000);
    return () => clearTimeout(id);
  }, [ready, push.state, tasks]);

  const handleTrigger = useCallback(
    (anchor: string) => {
      const at = new Date();
      for (const task of triggerable(getTasks(), anchor, at)) {
        upsert({
          ...task,
          dueAt: at.toISOString(),
          reminders: [at.toISOString()],
          needs: null,
          assumed: null,
          notifiedAt: null,
          updatedAt: at.toISOString(),
        });
      }
      setNow(new Date()); // so the trigger button disappears immediately
      show({ message: t("toast.triggered") });
      // Pressing "I'm leaving work" at about the same time every day teaches the app when that is.
      if (anchor in ANCHOR_CHOICES) void learn(`anchor.${anchor}`, roundedClock(at), "behavior");
    },
    [getTasks, learn, show, t, upsert],
  );

  // Ignored questions come back once, a few hours later: check shortly after load and on every tick.
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(resurface, 800);
    return () => clearTimeout(id);
  }, [ready, resurface]);

  const handleDelete = useCallback(
    (task: Task) => {
      setEditingId(null);
      remove(task.id);
      undoToast(t("toast.deleted"), () => upsert(task));
    },
    [remove, upsert, undoToast, t],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = visible.findIndex((x) => x.id === active.id);
    const to = visible.findIndex((x) => x.id === over.id);
    if (from >= 0 && to >= 0) move(visible, from, to);
  }

  useEffect(() => {
    resurfaceRef.current = resurface;
  }, [resurface]);

  // One question per group: show it on the first task of each group that is visible.
  const questionFor = (task: Task, index: number) => {
    if (!isQuestionOpen(task, now) || !task.needs) return undefined;
    const g = task.needs.group;
    if (g && visible.findIndex((x) => x.needs?.group === g) !== index) return undefined;
    return (
      <QuestionCard
        task={task}
        busy={answering === (g ?? task.id)}
        onAnswer={(a) => void answer(task, a)}
        onVoice={(audio, ms) => void answerByVoice(task, audio, ms)}
        onDismiss={() => dismissGroup(task)}
        onVoiceError={(kind) => show({ message: t(`voice.${kind}`) })}
      />
    );
  };

  const editing = tasks.find((x) => x.id === editingId) ?? null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-[max(16px,env(safe-area-inset-top))] pb-44">
      <header className="flex items-center justify-between py-3">
        <div className="text-door flex items-center gap-2">
          <Mark className="size-8" />
          <h1 className="t-lead text-ink">{t("app.name")}</h1>
        </div>
        <Link
          href="/settings"
          aria-label={t("nav.settings")}
          className="text-ink-2 hover:bg-surface-2 grid size-11 place-items-center rounded-full transition-colors"
        >
          <SlidersIcon />
        </Link>
      </header>

      <PushBanner
        state={push.state}
        hasReminders={tasks.some((x) => !x.done && x.dueAt)}
        onEnable={push.enable}
      />
      <ReminderAlerts
        alerts={reminders.alerts}
        snoozeMinutes={snoozeMinutes}
        onDone={reminders.done}
        onSnooze={reminders.snooze}
        onOpen={(id) => {
          reminders.hide(id);
          setEditingId(id);
        }}
      />
      <TriggerBar anchors={anchorsWaiting(tasks, now)} onTrigger={handleTrigger} />

      <FilterTabs value={filter} onChange={setFilter} />

      <main className="mt-3 flex flex-1 flex-col">
        {pending && (
          <div
            className="card-in shimmer rounded-card mb-2 px-4 py-3.5"
            role="status"
            aria-live="polite"
          >
            <span className="t-small text-ink-2" data-bidi>
              {pending.text ?? t("dock.processing")}
            </span>
          </div>
        )}
        {visible.length > 0 ? (
          <DndContext
            id="tasks-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            accessibility={{ screenReaderInstructions: { draggable: t("task.reorderHelp") } }}
          >
            <SortableContext
              items={visible.map((x) => x.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-2" aria-label={t(`filters.${filter}`)}>
                {visible.map((task, index) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    now={now}
                    draggable={filter !== "done"}
                    onToggle={handleToggle}
                    onOpen={setEditingId}
                    onAsk={(id) => {
                      const tk = tasks.find((x) => x.id === id);
                      if (tk) askAgain(tk);
                    }}
                    footer={questionFor(task, index)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          ready &&
          !pending && (
            <div key={filter} className="rise my-auto max-w-[28ch] py-16">
              <h2 className="t-title">{t(`empty.${filter}.title`)}</h2>
              <p className="text-ink-2 mt-2">{t(`empty.${filter}.body`)}</p>
            </div>
          )
        )}
      </main>

      <Dock
        busy={pending !== null}
        onSubmitText={submitText}
        onAudio={submitAudio}
        onVoiceError={(kind) => show({ message: t(`voice.${kind}`) })}
      />
      <TaskEditor
        task={editing}
        onClose={() => setEditingId(null)}
        onChange={(id, patch) =>
          // Setting a time by hand settles the question and replaces any learned guess.
          update(
            id,
            "dueAt" in patch && patch.dueAt ? { ...patch, needs: null, assumed: null } : patch,
          )
        }
        onDelete={handleDelete}
      />
    </div>
  );
}
