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

## D5. Speech-to-text: decision pending (v0.3)

No public benchmark compares commercial STT on Tunisian Arabic. The only Derja-specific study found
(TuniSpeech-21h, Jan 2026) put the best open model, Whisper large-v2, at about 25% WER.
General leaders are ElevenLabs Scribe v2 and Gemini. Candidates: Gemini (audio in) and ElevenLabs
Scribe. We will record Derja/French clips and compare before choosing one; the result and the reasons
are recorded here at v0.3. The browser Web Speech API is not the primary path.

## D6. Secrets

Keys live in `.env.local` (gitignored) and are read only in server routes. `.env.example` lists names.
