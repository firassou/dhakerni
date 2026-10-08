"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { ArrowUpIcon, MicIcon } from "./Icon";

/** Bottom dock: always within thumb reach. Mic is the primary action. */
export function Dock({ onSubmitText }: { onSubmitText?: (text: string) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSubmitText?.(value);
    setText("");
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4">
      <form
        onSubmit={submit}
        className="glass safe-bottom pointer-events-auto mb-3 flex w-full max-w-xl items-center gap-2 rounded-[28px] p-2"
      >
        <label className="sr-only" htmlFor="quick-add">
          {t("dock.inputLabel")}
        </label>
        <input
          id="quick-add"
          data-bidi
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("dock.placeholder")}
          autoComplete="off"
          enterKeyHint="send"
          className="placeholder:text-ink-2 min-w-0 flex-1 bg-transparent px-3 py-3 outline-none"
        />
        {text.trim() ? (
          <button
            type="submit"
            aria-label={t("dock.send")}
            className="bg-ink text-paper grid size-12 shrink-0 place-items-center rounded-full transition-transform duration-[var(--t-fast)] active:scale-90"
          >
            <ArrowUpIcon />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t("dock.talk")}
            className="bg-door text-door-ink grid size-14 shrink-0 place-items-center rounded-full shadow-[0_6px_18px_rgb(33_82_209/0.4)] transition-transform duration-[var(--t-base)] ease-[var(--ease-spring)] active:scale-90"
          >
            <MicIcon width={26} height={26} />
          </button>
        )}
      </form>
    </div>
  );
}
