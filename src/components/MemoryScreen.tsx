"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getDB } from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import { deleteFact, forgetAll, isUsable, listFacts, updateFactValue } from "@/lib/memory/profile";
import { describeFact } from "@/lib/questions/describe";
import type { ProfileFact } from "@/lib/schemas";
import { Brand } from "./Brand";
import { BackIcon, CloseIcon, PencilIcon } from "./Icon";
import { LearningSwitch } from "./LearningSwitch";
import { useToast } from "./Toast";

type Group = "words" | "routine" | "habits";
const groupOf = (key: string): Group =>
  key.startsWith("vague.") ? "words" : key.startsWith("anchor.") ? "routine" : "habits";

/** How a fact can be edited: a number of minutes, a clock time, a choice, or not at all. */
function editorKind(key: string): "minutes" | "time" | "priority" | null {
  if (key.startsWith("vague.") || key === "snooze.default") return "minutes";
  if (key.startsWith("anchor.") || key.startsWith("usual.time.")) return "time";
  if (key.startsWith("priority.")) return "priority";
  return null;
}

const field = "rounded-field bg-surface-2 px-3 py-2 outline-none focus:ring-2 focus:ring-door";

export function MemoryScreen() {
  const { t, locale } = useI18n();
  const { show } = useToast();
  const [facts, setFacts] = useState<ProfileFact[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmForget, setConfirmForget] = useState(false);
  const [openedAt] = useState(() => Date.now());

  const reload = useCallback(async () => {
    setFacts((await listFacts()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }, []);

  useEffect(() => {
    listFacts()
      .then((f) => setFacts(f.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))))
      .catch(() => setFacts([]));
  }, []);

  const grouped = useMemo(() => {
    const g: Record<Group, ProfileFact[]> = { words: [], routine: [], habits: [] };
    for (const f of facts ?? []) g[groupOf(f.key)].push(f);
    return g;
  }, [facts]);

  const ago = (iso: string) => {
    const days = Math.round((Date.parse(iso) - openedAt) / 86_400_000);
    const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-TN" : locale, {
      numeric: "auto",
    });
    return Math.abs(days) < 1 ? rtf.format(0, "day") : rtf.format(days, "day");
  };

  async function remove(fact: ProfileFact) {
    await deleteFact(fact.id);
    await reload();
    show({
      message: t("memory.deleted"),
      action: {
        label: t("memory.undo"),
        run: async () => {
          await (await getDB()).put("profile", fact);
          await reload();
        },
      },
    });
  }

  async function save(fact: ProfileFact) {
    const value = draft.trim();
    if (value) await updateFactValue(fact.id, value);
    setEditing(null);
    await reload();
  }

  async function wipe() {
    await forgetAll();
    setConfirmForget(false);
    await reload();
    show({ message: t("memory.forgotten") });
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl px-4 pt-[max(16px,env(safe-area-inset-top))] pb-16">
      <header className="flex items-center gap-1 py-3">
        <Link
          href="/settings"
          aria-label={t("nav.back")}
          className="text-ink-2 hover:bg-surface-2 grid size-11 place-items-center rounded-full"
        >
          <BackIcon />
        </Link>
        <h1 className="t-lead">{t("memory.title")}</h1>
        <Brand className="ms-auto" />
      </header>

      <p className="text-ink-2 mb-4">{t("memory.intro")}</p>
      <LearningSwitch />

      {facts && facts.length === 0 && (
        <p className="text-ink-2 mt-10 max-w-[32ch]">{t("memory.empty")}</p>
      )}

      {(["words", "routine", "habits"] as const).map(
        (g) =>
          grouped[g].length > 0 && (
            <section key={g} aria-labelledby={`g-${g}`} className="mt-8">
              <h2 id={`g-${g}`} className="t-small text-ink-2 mb-2 font-medium">
                {t(`memory.groups.${g}`)}
              </h2>
              <ul className="rounded-card bg-surface overflow-hidden">
                {grouped[g].map((f) => {
                  const kind = editorKind(f.key);
                  const isEditing = editing === f.id;
                  return (
                    <li key={f.id} className="border-line border-b px-4 py-3 last:border-b-0">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p data-bidi className="font-medium">
                            {describeFact(f, t)}
                          </p>
                          <p className="t-micro text-ink-2 mt-0.5">
                            {t(`memory.source.${f.source}`)} ·{" "}
                            {t("memory.updated", { when: ago(f.updatedAt) })}
                          </p>
                          {!isUsable(f) && (
                            <p className="t-micro text-ink-2 mt-0.5">{t("memory.notYet")}</p>
                          )}
                        </div>
                        {kind && !isEditing && (
                          <button
                            onClick={() => {
                              setEditing(f.id);
                              setDraft(f.value);
                            }}
                            aria-label={`${t("memory.edit")}: ${describeFact(f, t)}`}
                            className="text-ink-2 hover:bg-surface-2 grid size-10 shrink-0 place-items-center rounded-full"
                          >
                            <PencilIcon className="size-5" />
                          </button>
                        )}
                        <button
                          onClick={() => void remove(f)}
                          aria-label={`${t("memory.delete")}: ${describeFact(f, t)}`}
                          className="text-ink-2 hover:bg-danger/10 hover:text-danger grid size-10 shrink-0 place-items-center rounded-full"
                        >
                          <CloseIcon className="size-5" />
                        </button>
                      </div>

                      {isEditing && kind && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {kind === "minutes" && (
                            <input
                              type="number"
                              min={1}
                              max={1440}
                              aria-label={t("memory.value")}
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              className={`${field} w-28`}
                            />
                          )}
                          {kind === "time" && (
                            <input
                              type="time"
                              aria-label={t("memory.value")}
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              className={field}
                            />
                          )}
                          {kind === "priority" && (
                            <select
                              aria-label={t("memory.value")}
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              className={field}
                            >
                              <option value="high">{t("task.priority.high")}</option>
                              <option value="low">{t("task.priority.low")}</option>
                            </select>
                          )}
                          <button
                            onClick={() => void save(f)}
                            className="t-small bg-ink text-paper rounded-full px-4 py-2 font-medium active:scale-95"
                          >
                            {t("memory.save")}
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="t-small text-ink-2 hover:bg-surface-2 rounded-full px-4 py-2"
                          >
                            {t("memory.cancel")}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
      )}

      {facts && facts.length > 0 && (
        <section className="mt-10">
          {confirmForget ? (
            <div
              role="alertdialog"
              aria-label={t("memory.forgetAll")}
              className="rounded-card bg-danger/10 space-y-3 p-4"
            >
              <p>{t("memory.forgetConfirm")}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => void wipe()}
                  className="t-small bg-danger rounded-full px-4 py-2 font-medium text-white active:scale-95"
                >
                  {t("memory.forgetYes")}
                </button>
                <button
                  onClick={() => setConfirmForget(false)}
                  className="t-small text-ink-2 hover:bg-surface-2 rounded-full px-4 py-2"
                >
                  {t("memory.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmForget(true)}
              className="t-small rounded-field text-danger hover:bg-danger/10 w-full py-3 font-medium"
            >
              {t("memory.forgetAll")}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
