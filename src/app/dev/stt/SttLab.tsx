"use client";

import { useState } from "react";
import { getSessionId } from "@/lib/db";
import { useRecorder } from "@/lib/voice/useRecorder";

const CANDIDATES = [
  {
    id: "transcribe",
    label: "Gemini 3.5 Transcribe",
    q: "provider=gemini&model=gemini-3.5-transcribe",
  },
  { id: "flash", label: "Gemini 3.5 Flash", q: "provider=gemini&model=gemini-3.5-flash" },
  { id: "groq", label: "Groq Whisper large-v3", q: "provider=groq&model=whisper-large-v3" },
  {
    id: "groq-turbo",
    label: "Groq Whisper v3 turbo",
    q: "provider=groq&model=whisper-large-v3-turbo",
  },
  { id: "scribe", label: "ElevenLabs Scribe v2", q: "provider=elevenlabs&model=scribe_v2" },
];

interface Row {
  at: string;
  secs: number;
  out: Record<string, { text: string; ms: number } | { error: string }>;
}

/** Dev-only: speak once, see what each speech-to-text candidate heard. */
export function SttLab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rec = useRecorder({
    onError: (k) => setError(`mic: ${k}`),
    onRecorded: async (blob, ms) => {
      setBusy(true);
      const session = await getSessionId();
      const out: Row["out"] = {};
      await Promise.all(
        CANDIDATES.map(async (c) => {
          const t0 = Date.now();
          try {
            const fd = new FormData();
            fd.append("audio", blob, "clip");
            const r = await fetch(`/api/transcribe?${c.q}`, {
              method: "POST",
              body: fd,
              headers: { "x-session-id": session },
            });
            const j = await r.json();
            out[c.id] = r.ok
              ? { text: j.text, ms: Date.now() - t0 }
              : { error: `${r.status} ${j.error ?? ""}` };
          } catch (e) {
            out[c.id] = { error: String(e) };
          }
        }),
      );
      setRows((prev) => [
        { at: new Date().toLocaleTimeString(), secs: Math.round(ms / 100) / 10, out },
        ...prev,
      ]);
      setBusy(false);
    },
  });

  const recording = rec.state !== "idle";
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="t-title">Speech-to-text lab</h1>
      <p className="text-ink-2">
        Dev only. Say a sentence the way you really would (Derja, French, mixed). Every candidate
        hears the same recording. Note which one got it right.
      </p>
      <button
        onClick={() => (recording ? rec.stop() : void rec.start())}
        disabled={busy}
        className={`text-door-ink rounded-full px-6 py-3 font-medium disabled:opacity-50 ${recording ? "bg-danger" : "bg-door"}`}
      >
        {recording ? "Stop and compare" : busy ? "Comparing…" : "Record"}
      </button>
      {error && <p className="text-danger">{error}</p>}
      {rows.map((r, i) => (
        <section key={i} className="rounded-card bg-surface space-y-2 p-4">
          <h2 className="t-small text-ink-2">
            {r.at} · {r.secs}s
          </h2>
          {CANDIDATES.map((c) => {
            const o = r.out[c.id];
            return (
              <div
                key={c.id}
                className="border-line grid gap-1 border-t pt-2 sm:grid-cols-[11rem_1fr]"
              >
                <span className="t-small text-ink-2">{c.label}</span>
                <span data-bidi className="text-lg">
                  {!o ? (
                    "…"
                  ) : "error" in o ? (
                    <em className="text-danger">{o.error}</em>
                  ) : (
                    <>
                      {o.text || <em>(empty)</em>} <small className="text-ink-2">{o.ms}ms</small>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </section>
      ))}
    </main>
  );
}
