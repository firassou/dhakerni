"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { errorKey, usePartner } from "@/lib/partner/usePartner";
import { Brand } from "./Brand";
import { BackIcon } from "./Icon";

/** The page behind an invitation link: the code is already filled in, the person only says what to call them. */
export function JoinScreen({ code }: { code: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const p = usePartner();
  const [name, setName] = useState("");
  const error = p.error ? t(errorKey(p.error)) : null;

  return (
    <div className="page-in mx-auto min-h-dvh w-full max-w-xl px-4 pt-[max(16px,env(safe-area-inset-top))] pb-16">
      <header className="flex items-center gap-1 py-3">
        <Link
          href="/"
          aria-label={t("nav.back")}
          className="text-ink-2 hover:bg-surface-2 grid size-11 place-items-center rounded-full"
        >
          <BackIcon />
        </Link>
        <h1 className="t-lead">{t("partner.joinTitle")}</h1>
        <Brand className="ms-auto" />
      </header>
      <div className="rounded-card bg-surface mt-6 space-y-3 p-4">
        <p className="text-ink-2">{t("partner.joinIntro")}</p>
        <p
          dir="ltr"
          className="rounded-field bg-surface-2 py-3 text-center font-mono text-2xl tracking-[0.25em]"
        >
          {code.toUpperCase()}
        </p>
        <label className="block space-y-1">
          <span className="t-small text-ink-2">{t("partner.nameLabel")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder={t("partner.namePlaceholder")}
            className="rounded-field bg-surface-2 border-line w-full border px-3 py-2.5 focus:outline-none"
            data-bidi
          />
        </label>
        <button
          disabled={p.busy || p.state.kind === "paired"}
          onClick={async () => {
            if (await p.join(code, name)) router.replace("/settings#partner");
          }}
          className="t-small bg-brand text-brand-ink rounded-full px-4 py-2 font-medium disabled:opacity-50"
        >
          {t("partner.join")}
        </button>
        {error && (
          <p role="alert" className="rounded-field bg-danger/10 text-danger p-3 font-medium">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
