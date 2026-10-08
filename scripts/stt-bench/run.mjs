// Usage: node scripts/stt-bench/run.mjs   (reads clips/*.wav and utterances.json)
// Add your own clips: put <id>.wav (or .webm/.m4a) in clips/ and an entry in utterances.json.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const G = process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  E = process.env.ELEVENLABS_API_KEY;
const utts = JSON.parse(readFileSync(new URL("./utterances.json", import.meta.url)));
const clips = readdirSync(new URL("./clips/", import.meta.url));
const find = (id) => clips.find((c) => c.startsWith(id + "."));
const mime = (f) =>
  ({ wav: "audio/wav", webm: "audio/webm", m4a: "audio/mp4", mp3: "audio/mpeg", ogg: "audio/ogg" })[
    f.split(".").pop()
  ];

const PROMPT =
  "Transcribe this audio exactly as spoken. Keep every language as spoken: Tunisian Arabic (Derja) in Arabic script, French and English words in Latin script. Do not translate, correct or add anything. Output only the transcript.";

async function gemini(model, file) {
  const data = readFileSync(new URL(`./clips/${file}`, import.meta.url)).toString("base64");
  for (let a = 0; a < 5; a++) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${G}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: mime(file), data } }] }],
          generationConfig: { temperature: 0 },
        }),
      },
    );
    const j = await r.json();
    if (r.status === 429) {
      await new Promise((x) => setTimeout(x, 20000));
      continue;
    }
    return (
      j.candidates?.[0]?.content?.parts
        ?.map((p) => p.audioTranscription?.text ?? p.text ?? "")
        .join(" ")
        .trim() ?? `ERR ${JSON.stringify(j).slice(0, 120)}`
    );
  }
  return "ERR rate-limited";
}
async function scribe(file) {
  const fd = new FormData();
  fd.append("model_id", "scribe_v2");
  fd.append(
    "file",
    new Blob([readFileSync(new URL(`./clips/${file}`, import.meta.url))], { type: mime(file) }),
    file,
  );
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": E },
    body: fd,
  });
  const j = await r.json();
  return j.text?.trim() ?? `ERR ${JSON.stringify(j).slice(0, 120)}`;
}

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
function wer(ref, hyp) {
  const r = norm(ref).split(" "),
    h = norm(hyp).split(" ");
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1),
      );
  return d[r.length][h.length] / r.length;
}

const providers = {
  "gemini-3.5-transcribe": (f) => gemini("gemini-3.5-transcribe", f),
  "gemini-3.5-flash": (f) => gemini("gemini-3.5-flash", f),
  "elevenlabs-scribe_v2": scribe,
};
const rows = [];
const totals = Object.fromEntries(
  Object.keys(providers).map((k) => [k, { sum: 0, n: 0, derja: 0, nd: 0 }]),
);
for (const u of utts) {
  const file = find(u.id);
  if (!file) continue;
  for (const [name, fn] of Object.entries(providers)) {
    const t0 = Date.now();
    const hyp = await fn(file);
    const ms = Date.now() - t0;
    const w = hyp.startsWith("ERR") ? 1 : wer(u.text, hyp);
    totals[name].sum += w;
    totals[name].n++;
    if (u.lang.startsWith("derja")) {
      totals[name].derja += w;
      totals[name].nd++;
    }
    rows.push({ id: u.id, lang: u.lang, provider: name, ref: u.text, hyp, wer: +w.toFixed(2), ms });
    console.log(u.id, name.padEnd(22), String(w.toFixed(2)).padStart(5), `${ms}ms`, "|", hyp);
  }
}
console.log("\nProvider                 mean WER   Derja-only WER   (n)");
for (const [k, t] of Object.entries(totals))
  console.log(
    k.padEnd(24),
    (t.sum / t.n).toFixed(3).padStart(8),
    (t.derja / t.nd).toFixed(3).padStart(14),
    `   (${t.n})`,
  );
writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(rows, null, 2));
