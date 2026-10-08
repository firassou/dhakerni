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
import { matchesFilter, selectTasks, type Filter } from "@/lib/tasks/filters";
import { useTasks } from "@/lib/tasks/useTasks";
import { Dock } from "./Dock";
import { FilterTabs } from "./FilterTabs";
import { Mark, SlidersIcon } from "./Icon";
import { TaskCard } from "./TaskCard";
import { TaskEditor } from "./TaskEditor";
import { useToast, useUndoToast } from "./Toast";

const LINGER_MS = 450;

export function HomeScreen() {
  const { t } = useI18n();
  const undoToast = useUndoToast();
  const { tasks, ready, insert, getTasks, update, toggle, remove, upsert, move } = useTasks();
  const { show } = useToast();
  const [filter, setFilter] = useState<Filter>("today");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  // Tasks just completed stay visible briefly so the check animation can play.
  const [lingering, setLingering] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    getSessionId().catch(() => {});
    const tick = setInterval(() => setNow(new Date()), 30_000);
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
    // Jump to the view where the first new task lives, so it is visible straight away.
    onCreated: (created) => {
      const at = new Date();
      const view = (["today", "upcoming", "needsTime"] as const).find((f) =>
        matchesFilter(created[0], f, at),
      );
      if (view) setFilter(view);
    },
  });

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
                {visible.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    now={now}
                    draggable={filter !== "done"}
                    onToggle={handleToggle}
                    onOpen={setEditingId}
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
        onChange={update}
        onDelete={handleDelete}
      />
    </div>
  );
}
