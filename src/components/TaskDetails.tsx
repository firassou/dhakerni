"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { Task } from "@/lib/schemas";
import {
  acceptSuggestion,
  addItem,
  addStep,
  chooseOption,
  dismissAllSuggestions,
  dismissSuggestion,
  formatItem,
  removeItem,
  removeStep,
  setItemQty,
  toggleItem,
  toggleStep,
} from "@/lib/tasks/items";
import { CloseIcon, CheckIcon } from "./Icon";

/** Edits return the whole next task; the editor saves just the parts these sections own. */
export type Edit = (fn: (t: Task) => Task) => void;

const field =
  "min-w-0 rounded-field bg-surface-2 px-3 py-2.5 outline-none focus:ring-2 focus:ring-door";
const iconBtn =
  "grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2";
const smallBtn =
  "t-small rounded-full bg-ink px-4 py-2 font-medium text-paper transition-transform active:scale-95 disabled:opacity-40";

function Check({
  checked,
  label,
  onClick,
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all duration-[var(--t-base)] ease-[var(--ease-spring)] ${
        checked ? "border-door bg-door text-door-ink" : "border-ink-2/50"
      }`}
    >
      <CheckIcon className={`check size-3.5 ${checked ? "check-on" : ""}`} />
    </button>
  );
}

export function ItemsSection({ task, edit }: { task: Task; edit: Edit }) {
  const { t, locale } = useI18n();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    edit((x) => addItem(x, name, qty ? Number(qty) : null));
    setName("");
    setQty("");
  };
  return (
    <section aria-labelledby="items-h">
      <h3 id="items-h" className="t-small text-ink-2 mb-1">
        {t("editor.items")}
      </h3>
      <ul className="space-y-1.5">
        {task.items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <Check
              checked={item.done}
              label={t(item.done ? "task.uncheckItem" : "task.checkItem", { item: item.name })}
              onClick={() => edit((x) => toggleItem(x, item.id))}
            />
            <span
              data-bidi
              className={`min-w-0 flex-1 ${item.done ? "text-ink-2 line-through" : ""}`}
            >
              {formatItem(item, locale)}
            </span>
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              aria-label={`${t("editor.qty")}: ${item.name}`}
              value={item.qty ?? ""}
              onChange={(e) =>
                edit((x) =>
                  setItemQty(x, item.id, e.target.value === "" ? null : Number(e.target.value)),
                )
              }
              className={`${field} w-20`}
            />
            <button
              type="button"
              aria-label={t("editor.removeItem", { item: item.name })}
              onClick={() => edit((x) => removeItem(x, item.id))}
              className={iconBtn}
            >
              <CloseIcon className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <input
          data-bidi
          aria-label={t("editor.itemName")}
          placeholder={t("editor.addItem")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
          className={`${field} flex-1`}
        />
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          aria-label={t("editor.qty")}
          placeholder="#"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className={`${field} w-20`}
        />
        <button type="button" onClick={submit} disabled={!name.trim()} className={smallBtn}>
          {t("editor.add")}
        </button>
      </div>
    </section>
  );
}

export function StepsSection({ task, edit }: { task: Task; edit: Edit }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const submit = () => {
    if (!title.trim()) return;
    edit((x) => addStep(x, title));
    setTitle("");
  };
  return (
    <section aria-labelledby="steps-h">
      <h3 id="steps-h" className="t-small text-ink-2 mb-1">
        {t("editor.steps")}
      </h3>
      <ul className="space-y-1.5">
        {task.subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <Check
              checked={s.done}
              label={t(s.done ? "task.uncheckItem" : "task.checkItem", { item: s.title })}
              onClick={() => edit((x) => toggleStep(x, s.id))}
            />
            <span data-bidi className={`min-w-0 flex-1 ${s.done ? "text-ink-2 line-through" : ""}`}>
              {s.title}
            </span>
            <button
              type="button"
              aria-label={t("editor.removeStep", { step: s.title })}
              onClick={() => edit((x) => removeStep(x, s.id))}
              className={iconBtn}
            >
              <CloseIcon className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <input
          data-bidi
          aria-label={t("editor.stepTitle")}
          placeholder={t("editor.addStep")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
          className={`${field} flex-1`}
        />
        <button type="button" onClick={submit} disabled={!title.trim()} className={smallBtn}>
          {t("editor.add")}
        </button>
      </div>
    </section>
  );
}

/** Ideas the AI had for a big goal. Nothing becomes a step until the person adds it. */
export function SuggestionsSection({ task, edit }: { task: Task; edit: Edit }) {
  const { t } = useI18n();
  if (!task.suggestions.length) return null;
  return (
    <section aria-labelledby="sugg-h" className="rounded-field bg-door-soft p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 id="sugg-h" className="font-medium">
            {t("editor.suggestions")}
          </h3>
          <p className="t-small text-ink-2">{t("editor.suggestionsHelp")}</p>
        </div>
        <button
          type="button"
          onClick={() => edit(dismissAllSuggestions)}
          className="t-small text-ink-2 shrink-0 underline underline-offset-4"
        >
          {t("editor.dismissAll")}
        </button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {task.suggestions.map((text) => (
          <li key={text} className="flex items-center gap-2">
            <button
              type="button"
              aria-label={t("editor.addSuggestion", { text })}
              onClick={() => edit((x) => acceptSuggestion(x, text))}
              className="t-small bg-surface flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-2 text-start font-medium active:scale-[0.99]"
            >
              <span aria-hidden className="text-door">
                +
              </span>
              <span data-bidi className="min-w-0 flex-1">
                {text}
              </span>
            </button>
            <button
              type="button"
              aria-label={t("editor.dismissSuggestion", { text })}
              onClick={() => edit((x) => dismissSuggestion(x, text))}
              className={iconBtn}
            >
              <CloseIcon className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The options, the AI's lean (labelled as a suggestion), and the person's own pick. */
export function DecisionSection({ task, edit }: { task: Task; edit: Edit }) {
  const { t } = useI18n();
  const d = task.decision;
  if (!d) return null;
  return (
    <section aria-labelledby="dec-h" className="rounded-field bg-sun/20 space-y-2 p-3">
      <h3 id="dec-h" className="font-medium">
        {t("editor.decision")}
      </h3>
      <div role="group" aria-label={t("editor.options")} className="flex flex-wrap gap-2">
        {d.options.map((option) => {
          const chosen = d.chosen === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={chosen}
              aria-label={chosen ? t("editor.picked", { option }) : t("editor.pick", { option })}
              onClick={() => edit((x) => chooseOption(x, option))}
              className={`t-small rounded-full border px-4 py-2 font-medium transition-transform active:scale-95 ${
                chosen ? "border-door bg-door text-door-ink" : "border-ink/15 bg-surface"
              }`}
            >
              <span data-bidi>{option}</span>
            </button>
          );
        })}
      </div>
      {d.recommendation && (
        <p className="t-small text-ink-2" data-bidi>
          <span className="text-ink font-medium">{t("task.suggestionLabel")}: </span>
          {d.recommendation}
          {d.reason ? ` — ${d.reason}` : ""}
        </p>
      )}
    </section>
  );
}
