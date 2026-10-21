"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { errorKey, usePartner } from "@/lib/partner/usePartner";

const btn =
  "t-small rounded-full px-4 py-2 font-medium transition-transform duration-[var(--t-fast)] active:scale-95 disabled:opacity-50";
const field = "rounded-field bg-surface-2 border-line w-full border px-3 py-2.5 focus:outline-none";

/** Pairing with one person: make an invitation, use one, name them, unpair. */
export function PartnerSettings() {
  const { t } = useI18n();
  const p = usePartner();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const error = p.error ? t(errorKey(p.error)) : null;
  const pairedName = p.state.kind === "paired" ? p.state.name : "";
  const link = (c: string) => `${location.origin}/join/${c}`;

  async function copy(c: string) {
    try {
      await navigator.clipboard.writeText(link(c));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is shown on screen anyway */
    }
  }

  return (
    <div className="rounded-card bg-surface space-y-3 p-4" data-testid="partner-settings">
      <p className="text-ink-2">{t("partner.intro")}</p>

      {p.state.kind === "paired" && (
        <>
          <p className="font-medium" aria-live="polite">
            {p.state.name ? t("partner.pairedWith", { name: p.state.name }) : t("partner.paired")}
          </p>
          <label className="block space-y-1">
            <span className="t-small text-ink-2">{t("partner.nameLabel")}</span>
            <input
              key={p.state.name}
              defaultValue={p.state.name}
              maxLength={40}
              placeholder={t("partner.namePlaceholder")}
              onBlur={(e) => e.target.value !== pairedName && void p.rename(e.target.value)}
              className={field}
              data-bidi
            />
          </label>
          {confirmLeave ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="t-small text-ink-2">{t("partner.unpairAsk")}</span>
              <button
                disabled={p.busy}
                onClick={async () => {
                  if (await p.unpair()) setConfirmLeave(false);
                }}
                className={`${btn} bg-danger text-white`}
              >
                {t("partner.unpair")}
              </button>
              <button onClick={() => setConfirmLeave(false)} className={`${btn} bg-surface-2`}>
                {t("partner.cancel")}
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmLeave(true)} className={`${btn} bg-surface-2`}>
              {t("partner.unpair")}
            </button>
          )}
        </>
      )}

      {p.state.kind === "inviting" && (
        <>
          <p className="t-small text-ink-2">{t("partner.inviteHelp")}</p>
          <p
            dir="ltr"
            data-testid="invite-code"
            className="rounded-field bg-surface-2 py-3 text-center font-mono text-2xl tracking-[0.25em]"
          >
            {p.state.code}
          </p>
          <p dir="ltr" className="t-micro text-ink-2 break-all">
            {link(p.state.code)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void copy((p.state as { code: string }).code)}
              className={`${btn} bg-brand text-brand-ink`}
            >
              {copied ? t("partner.copied") : t("partner.copyLink")}
            </button>
            <button onClick={p.cancelInvite} className={`${btn} bg-surface-2`}>
              {t("partner.cancel")}
            </button>
            <span className="t-small text-ink-2" aria-live="polite">
              {t("partner.waiting")}
            </span>
          </div>
        </>
      )}

      {p.state.kind === "unpaired" && (
        <>
          <label className="block space-y-1">
            <span className="t-small text-ink-2">{t("partner.nameLabel")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder={t("partner.namePlaceholder")}
              className={field}
              data-bidi
            />
          </label>
          <button
            disabled={p.busy}
            onClick={() => void p.invite(name)}
            className={`${btn} bg-brand text-brand-ink`}
          >
            {t("partner.invite")}
          </button>
          <div className="border-line space-y-2 border-t pt-3">
            <label className="block space-y-1">
              <span className="t-small text-ink-2">{t("partner.haveCode")}</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={16}
                placeholder={t("partner.codePlaceholder")}
                autoCapitalize="characters"
                autoComplete="off"
                dir="ltr"
                className={`${field} font-mono tracking-widest`}
              />
            </label>
            <button
              disabled={p.busy || !code.trim()}
              onClick={() => void p.join(code, name)}
              className={`${btn} bg-surface-2`}
            >
              {t("partner.join")}
            </button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-field bg-danger/10 text-danger p-3 font-medium">
          {error}
        </p>
      )}
      <p className="t-micro text-ink-2">{t("partner.privacy")}</p>
    </div>
  );
}
