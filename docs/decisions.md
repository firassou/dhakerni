# Decisions

## D1. Stack

Next.js 16.4 (App Router) + React 19.3, TypeScript strict, Tailwind v4, `idb` for IndexedDB, Zod 4,
Vercel AI SDK 7, Vitest 5, Playwright 1.64. Versions were taken from `npm` at install time on 2026-10-08.

## D2. i18n without URL prefixes

Locale lives on the device (localStorage) and defaults to `navigator.languages`. The app has no
server-rendered, locale-specific content, so URL routing would add cost without benefit. Messages are
JSON in `messages/`. An inline script sets `lang`/`dir` before first paint to avoid flashes.
Server and first client render both use English, and the real locale applies right after hydration.

## D3. Hand-written service worker

Serwist's Next plugin targets webpack; this project builds with Turbopack. A small `public/sw.js`
covers the offline shell and, from v0.6, push handlers.

## D4. Web Push: state of the platform (researched 2026-10-08) and fallback

- **Android / desktop (Chrome, Edge, Firefox):** works in browser and installed PWA.
- **iOS / iPadOS:** only for a PWA added to the Home Screen, permission requested from a user tap.
  iOS 18.4+ adds Declarative Web Push (JSON payload, no service worker needed to display).
- **No background sync on iOS**, and storage may be evicted after inactivity, so reminders cannot rely
  on the device waking the app.
- **Fallback strategy:** (1) in-app alerts and local scheduling while the app is open;
  (2) server push when subscribed; (3) on iOS in a normal Safari tab, an install prompt explains
  Add to Home Screen; (4) if push is denied or unsupported, an honest banner says reminders only fire while
  the app is open. Reminders also remain visible in "Today" and "Needs time".
- **Server data:** only subscription, anonymous session id, fire time and short title; encrypted at
  rest; deleted after firing (implemented in v0.6).

## D5. Speech-to-text and parser model (v0.3, provisional)

**Status: provider not final.** It becomes final after a test with real Derja voice (see below).

What the research found (2026-10-08):

- No public benchmark compares commercial STT on Tunisian Arabic. The only Derja study found
  (TuniSpeech-21h, Jan 2026) put its best open model, Whisper large-v2, at about 25% WER.
- `TuniSpeech-AI/whisper-tunisian-dialect` (Hugging Face) is the one Tunisian-specific model. It is CC-BY-NC
  (non-commercial), 2B parameters, not hosted by any inference provider, and tuned for short clips. Not usable
  in this app now; revisit only for self-hosting.
- Candidates wired in behind `STT_PROVIDER`: `groq` (Whisper large-v3 / turbo), `gemini`
  (`gemini-3.5-transcribe`, a dedicated model that answers in `audioTranscription.text`), `elevenlabs`
  (Scribe v2). The browser Web Speech API is not used.

What happened when I tried to benchmark:

- No real recordings were available. Synthetic clips failed: Gemini TTS free tier allows 10 requests/day and
  ElevenLabs free accounts cannot use TTS via API. A first clip batch was also invalid (the TTS read my
  instruction aloud). Those numbers were discarded; nothing from them is used here.
- `/dev/stt` (dev only) records one sentence and shows what every candidate heard. The decision is made from
  real voice samples.

Free-tier reality (checked): Google AI Studio free tier allows about 20 requests/day per Gemini model, which is
exhausted by one eval run, so Google needs billing for real use. Groq's free plan allows Whisper at 2,000
requests/day and its chat models (`openai/gpt-oss-120b`, Qwen) at 1,000/day.

Parser eval (`npm run eval`, 48 cases, text input, strict: every field of a case must be right):

- `gemini-3.5-flash-lite`: 48/48. `gemini-3.5-flash`: 20/20 of the cases it could run before the daily quota
  ended.
- **Read this number with care.** The cases and the prompt were written together and the prompt contains a few
  of the same example phrases, so this is not an independent test. It also excludes speech-to-text errors.
  It shows the pipeline and resolver work, not how well the app understands any given person. Expect lower
  accuracy on real speech; add misses from real use to `evals/cases.json`.

## D7. The model describes time; code resolves it

The parser returns a structured `when` (kind, day, time, dayPart, offset, vague word, anchor) and never
computes dates. `src/lib/time/resolve.ts` turns it into an instant in the device's time zone. This keeps date
math deterministic and testable, lets learned profile values (v0.5) override defaults, and lets one reminder be
shared by several tasks. "Today" with no clock time, once the morning has passed, resolves to "Needs time"
instead of a time already in the past.

## D8. Rate limiting

`/api/parse` and `/api/transcribe` require a session id header and allow 20 calls/minute and 400/day per
session, plus a looser per-IP cap (5x) so a made-up session id does not buy unlimited calls. Counters live in
Upstash Redis when configured, in memory otherwise.

## D6. Secrets

Keys live in `.env.local` (gitignored) and are read only in server routes. `.env.example` lists names.
