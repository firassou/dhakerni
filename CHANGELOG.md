# Changelog

All notable changes to this project are documented here. Format: Keep a Changelog; versions: SemVer.

## [Unreleased]

### Added

- The text field takes several lines and grows as you type. With a keyboard Enter sends and Shift+Enter breaks
  the line; on a phone Enter breaks the line and the button sends.
- Tapping anywhere on a task card opens the editor, not only the title.
- Long-press (or long-click) a card to pick several, then delete them together, with one Undo.
- Settings, Reset everything: wipes tasks, what was learned, settings and the server's copy of the reminders.
- A reminder nobody answers is sent again twice, 3 minutes apart, and each copy vibrates. Done, Snooze or opening
  the app stops the repeats. On Android, Settings explains how to stop the phone holding reminders back.

### Changed

- Voice no longer creates tasks directly: what was heard is written into the text field so it can be checked and
  corrected before it is sent.
- Finished tasks are kept for one day, then removed.

### Fixed

- The Done list showed its tasks for a moment and then they faded away.

## [0.8.0] - 2026-10-08

### Added

- A smarter parser: clean short titles with the full idea in the description, quantities and checkable items
  ("two juice" becomes Buy juice, 2x juice), grouping of things bought together, optional suggested steps for big
  goals, and decision help with a clearly labelled suggestion you can disagree with.
- Items, steps, suggestions and decisions on the task card and in the editor (check items off straight from the card).
- A casual time hint on upcoming tasks: "in 25 minutes", "tomorrow", "in 3 days".
- An opening animation: the list-and-bell icon draws itself, the bell rings, the blue collapses toward the mic.
  Once per session, tap or any key skips it, off for reduced motion. The installed app's launch colour matches it.
- The "Dhakerni" header links home (and returns to Today), on Home, Settings and Memory.
- Clear feedback for dragging: lifted card, placeholder, gliding neighbours, drop highlight, vibration and spoken
  announcements. Deleted and completed cards now animate out.

### Fixed

- The favicon: production served the framework's default icon first. Now the real icon, with cache-busting URLs.
- A crash ("task.items is undefined") on tasks saved by older versions.
- Dragging only snapped at the end because an entrance animation overrode the drag movement.
- Settings could reset a just-chosen city or learning switch (a stale read landing late).
- The parser sometimes translated Derja titles, dropped Latin-letter time words like "ghodwa", and merged two
  actions into one task.

## [0.7.0] - 2026-10-08

### Added

- Prayer-time words: pick a Tunisian city in Settings and "بعد العصر" or "عند المغرب" become real times
  (computed on the device with `adhan`, Tunisian Ministry angles). Shows today's five times.
- Recording can always be cancelled without sending anything to the AI: a cancel button while recording, drag the
  held mic away and let go, or press Escape.
- Accessibility checks (axe, WCAG AA) in the test suite for every screen in light, dark, English and Arabic.
- Keyboard-only and speed tests.

### Fixed

- The recording timer never counted past 0:00.
- Pressing Escape while the microphone was still starting did not cancel the recording.
- Closing the task editor left keyboard focus on the page body instead of the task you opened.
- The Next.js dev badge covered the dock's cancel button during development.

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
