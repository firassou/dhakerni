# Changelog

All notable changes to this project are documented here. Format: Keep a Changelog; versions: SemVer.

## [0.6.0] - 2026-10-08

### Added

- "What Dhakerni knows about you": every learned fact in plain words with its source and age, edit, delete with
  undo, "not used yet" for facts that have not repeated, and "Forget everything" with a confirmation.
- Learning switch (Settings and the memory screen).
- Passive learning with a trust threshold: usual time per category, typical priority per category, snooze habit,
  language mix, repeated titles. Nothing noticed from behavior is used until it repeats.
- Corrections: changing a time the app assumed lowers trust in the old value; the same correction twice replaces it.
- Snooze length picker on reminders.
- Each parse request sends only the trusted facts relevant to that sentence.
- Backup: export and import (merge or replace) of tasks, the profile and settings, with validation.

## [0.5.0] - 2026-10-08

### Added

- Reminders: due tasks alert inside the app (Done, Snooze, Open), and as a system notification when the tab is in
  the background. Each reminder shows once.
- Web Push for a closed app: encrypted server store (Upstash), VAPID, atomic claim-and-delete firing,
  `/api/cron/fire` for a scheduler, `npm run dev:cron` locally. Verified end to end with real Chrome.
- Service worker notification buttons (Done, Snooze with the learned or default minutes, Open) that work with the
  app closed; desktop Firefox falls back to click-to-open.
- Settings: notification status and controls with honest messages (blocked, unsupported, server not set up,
  iPhone needs the Home Screen), a test notification, and a stricter privacy text.
- One-tap triggers for event-based reminders ("I'm leaving work"), no location tracking.
- Settings footer: version number and "Made with love by Firas".

### Security

- Push subscription endpoints are accepted only from known push services.

## [0.4.0] - 2026-10-08

### Added

- Clarifying questions for imprecise times: a vague word ("بعد شوية") or an event ("after work") creates the
  task in "Needs time" and asks one short question in your language, once per group of tasks, with 3-4
  tappable answers, a custom time and a voice answer. Plain tasks with no time cue are never asked about.
- Answers save a profile fact (source, time, confidence) in IndexedDB: "شوية" = 20 min, leaves work at 17:00.
  The first save shows "Saved: ... Change anytime."; later uses are silent and show an editable chip.
  A correction replaces the old value. Facts are not saved when learning is off.
- Ignored questions collapse after 20 minutes and return exactly once, 3 hours after creation, with a Show button.
- Tapping a task's "Needs time" chip asks again on demand.

### Changed

- Parser writes the task category in the same language as the task.

## [0.3.0] - 2026-10-08

### Added

- Hold-to-talk and tap-to-talk recording with live waveform; typed text goes through the same parser.
- `/api/transcribe` and `/api/parse` with session rate limits. Speech-to-text: ElevenLabs Scribe v2 (chosen after a real-voice comparison; Groq and Gemini adapters kept). Parser: Gemini flash-lite with automatic fallback to Groq.
- New app icon (list and bell on door-blue).
- Structured parser output (Zod): several tasks per utterance, shared reminders, uncertain fields.
- Time resolver and "Needs time" state with reason; parse failures still save the text.
- Eval set of 48 utterances and `npm run eval`; dev-only `/dev/stt` provider comparison page.

## [0.2.0] - 2026-10-08

### Added

- Task list with filters (Today, Upcoming, Needs time, All, Done); overdue tasks surface under Today.
- Quick add from the dock; new tasks start in "Needs time" until the parser arrives.
- Task cards with animated completion, live editor sheet (title, due, priority, list, notes), delete.
- Undo toasts for add, complete and delete; optimistic updates persisted to IndexedDB.
- Drag and keyboard reorder that keeps hidden tasks in place.
- 24-hour times in Arabic and French.

## [0.1.0] - 2026-10-08

### Added

- Next.js 16 app shell, design tokens (light/dark), Readex Pro for Arabic and Latin.
- Arabic (ar-TN), French and English with system detection, manual override and full RTL.
- IndexedDB schema (tasks, profile, meta), Zod schemas, anonymous session id.
- Installable PWA manifest, icons and offline app shell.
- Settings screen with language picker and privacy summary.
- Docs: design notes, decisions. Vitest and Playwright set up.
