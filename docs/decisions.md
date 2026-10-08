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

## D4. Web Push: platform state (researched 2026-10-08), what is built, and the fallback

- **Android / desktop (Chrome, Edge, Firefox):** Web Push works in the browser and in an installed PWA.
- **iOS / iPadOS:** only for a PWA added to the Home Screen, with permission requested from a tap. Not in a
  normal Safari tab. iOS has no background sync, and storage may be evicted after inactivity.
- **Notification buttons (Done, Snooze, Open):** supported in Chrome, Edge and Android. **Desktop Firefox shows
  no action buttons**; clicking the notification opens the app, which then shows the reminder with Done and
  Snooze. The Settings screen says so.
- **Chrome refuses Web Push in incognito.** Automated tests therefore use a persistent profile.

What is built (v0.5):

1. The app schedules and shows reminders itself while open (alert card with Done / Snooze / Open, and a system
   notification when the tab is in the background). This needs no server.
2. With notifications on, the app syncs future reminders to `/api/reminders`. The server stores only the push
   subscription, the anonymous session id, the fire time and a title cut to 80 characters, all AES-256-GCM
   encrypted, in Upstash Redis. A scheduler calls `/api/cron/fire` every minute; due reminders are claimed
   atomically (so none is sent twice), pushed, and deleted. A dead subscription (404/410) is forgotten.
3. The service worker shows the notification, marks the task as notified in IndexedDB (so the app does not alert
   again), and handles Done and Snooze by editing IndexedDB directly, so they work with the app closed.
   Snooze also re-schedules on the server.
4. Turning notifications off sends `forget`, which deletes the subscription and every scheduled reminder.
5. Subscription endpoints are checked against known push services only (FCM, Mozilla, Apple, Windows), so the
   server cannot be made to call arbitrary URLs.

Fallbacks, in order: in-app alerts while the app is open; server push when subscribed; on iOS in a Safari tab, an
install guide; if push is blocked or unsupported or the server is not configured, Settings says so plainly and
reminders still appear while the app is open and as the overdue chip.

**Scheduler.** Vercel Cron on the Hobby plan runs at most once a day, which is too slow for reminders. Use a free
external pinger every minute (see README) or Vercel Pro cron. Locally: `npm run dev:cron`.

**Manual triggers instead of location.** Tasks waiting on an event ("after I leave work") show a one-tap button
("I'm leaving work"). Pressing it fires those reminders now and records the time as a low-confidence fact; it only
affects behavior after the same time repeats. No geofencing or location is used.

## D5. Speech-to-text and parser model (v0.3)

**Decision: ElevenLabs Scribe v2 for speech-to-text** (`STT_PROVIDER=elevenlabs`, the default), chosen from a
real-voice comparison on 2026-10-08 with the dev page `/dev/stt`. The parser model is a separate choice (below).

Real-voice result (one 11-second sentence, Derja mixed with French, spoken by the project owner):

- **Scribe v2** kept the Derja as spoken ("بش ناخو عصير… حاب نمشي للدار") and kept French words in Latin
  script ("shampooing", "gazoz"). The only candidate that obeyed "do not translate".
- **Groq Whisper large-v3 and v3-turbo** rewrote the Derja into formal Arabic ("نريد أن نأخذ عصير…"),
  changing the words. Fast (about 2 s) and free, but wrong for this app.
- **Gemini 3.5 Transcribe** returned empty text on browser-recorded audio in two tries (cause not found).
  **Gemini 3.5 Flash** was out of free quota.
- This is one speaker and a few sentences, not a benchmark. Keep using `/dev/stt` to re-check, and note
  Scribe's free credits are limited: check usage before launch.

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

- Before the real-voice test, synthetic clips failed: Gemini TTS free tier allows 10 requests/day and
  ElevenLabs free accounts cannot use TTS via API. A first clip batch was also invalid (the TTS read my
  instruction aloud). Those numbers were discarded; nothing from them is used here.
- `/dev/stt` (dev only) records one sentence and shows what every candidate heard.

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
