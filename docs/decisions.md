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

## D9. Learning: what is learned, when it counts, how it is corrected

Everything learned is a row in the `profile` store (key, value, source, confidence, updatedAt), visible and
editable on the "What Dhakerni knows about you" screen. Nothing is learned while the learning switch is off;
facts already saved are still used until deleted.

| Fact                          | Learned from                                                                      | Used for                                   |
| ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| `vague.<word>` (minutes)      | answering a question                                                              | resolving that word silently               |
| `anchor.<event>` (clock time) | answering a question; pressing a trigger at a repeatable time                     | resolving that event silently              |
| `usual.time.<category>`       | 3+ clock times the person said or set for that category, mostly within 45 minutes | the time for "tomorrow" with no clock time |
| `priority.<category>`         | 3 of the last 4 manual priority edits agree                                       | default priority when the parser gave none |
| `snooze.default`              | the same non-default snooze chosen 3 times in a row                               | the Snooze button and notification         |
| `language.mix`                | every 10 tasks, if both Arabic and Latin script are common                        | one hint sentence to the parser            |
| `frequent.<title>`            | the same title added 3, 5, 10 times                                               | shown on the screen only (not used yet)    |

**Trust threshold.** A first answer is saved at confidence 0.75 and used at once (the person just told us).
Anything noticed from behavior starts at 0.4 and is ignored until it repeats and reaches 0.6 (+0.15 per
confirmation). Times from defaults ("tomorrow morning" = 08:00) or relative phrases ("in 10 minutes") never
teach anything, so the app cannot reinforce its own guesses.

**Corrections outweigh older data.** If the person changes a time the app assumed, the learned value loses 0.25
confidence, so it may drop below the threshold and the app asks again. The same new value twice in a row
replaces the old one; a different second value does not. Typing a value on the memory screen sets confidence 1.

**What the AI sees.** Each parse request carries only trusted facts that matter for that sentence (a vague word
that appears in it, the language mix). Anchors, usual times, titles and everything else stay on the device.

**Not done:** `frequent.<title>` is collected and shown but nothing acts on it yet; abbreviations and personal
vocabulary beyond vague words are not learned separately.

## D10. Backup

Export writes one JSON file: tasks, profile facts, the observations behind them, learning switch and language.
It leaves out the anonymous session id and the push subscription, which belong to one device. Import validates
every item with the same Zod schemas and skips damaged ones (and says how many). Merge keeps current data and
lets the newer copy win; Replace makes the device match the file.

## D11. Prayer-time words

`adhan` (maintained, MIT) computes the five prayers on the device from a city the person picks in Settings
(the 24 governorate capitals, a fixed list: no location lookup, nothing detected or sent). Method: Fajr and Isha
at 18 degrees (Tunisia's Ministry of Religious Affairs), Asr with the standard shadow (Maliki, Shafi'i, Hanbali).
The parser maps a prayer name used as a moment ("عند المغرب") to `prayer_<name>` and "بعد العصر" to
`after_prayer_<name>` (the adhan plus 20 minutes). With a city set these resolve to a real time, shown as an
editable chip ("After Asr ≈ 16:12"), recomputed per day so winter and summer are right. Without a city the app
asks, and the question offers a link to Settings. "العشاء" alone near the evening means dinner; the Isha prayer is
used only when the prayer is clearly meant. Prayer anchors never create "I'm leaving..." trigger buttons and never
become learned facts, because they come from the clock.

## D12. Accessibility and speed: what is checked, and how

- **axe-core** (WCAG 2.0/2.1/2.2 A and AA) runs in the e2e suite on the home screen (empty and with tasks, an open
  question), Settings, the memory screen and the task editor, in light, dark, English and Arabic. A guard test
  injects a deliberate contrast failure and requires the scanner to catch it, so a green run means something.
  axe finds roughly a third of accessibility problems automatically; it does not replace testing with a screen reader.
- **Keyboard:** one test does the main flow with the keyboard alone (add, complete, undo, edit, filter, record and
  cancel). Focus rings are asserted to be visible. Closing the editor or the import dialog returns focus to the
  button that opened it.
- **Speed:** measured in the page from the click event to the result on screen, dev build: completing a task
  about 6 ms, opening the editor about 23 ms, a typed task appearing about 70 ms including a mocked parse and the
  IndexedDB write. The 100 ms budget is asserted for the first two.
- **Motion:** every animation is switched off by `prefers-reduced-motion`.
- **Not verified:** real screen readers (VoiceOver, TalkBack, NVDA), 60 fps on low-end phones, and iOS Safari.

## D13. A smarter parser: understanding, not extracting

The parser's job is to turn a loose spoken idea into a clear, usable task. For each task it returns:

- **title**: a short action (verb + object), clearer than the raw words but in the person's own dialect and script
  ("nelbess labsa 9bal ma tji x" becomes "nbadel 7wayji").
- **description**: the full idea restated, keeping every detail (order, conditions, people, places, reasons).
  Stored in the task's description field. Never adds facts. With several tasks from one sentence, each gets only
  its own part.
- **items** with quantity and unit ("ill bought two juice" gives title "Buy juice" and 2x juice). Things bought or
  prepared together become ONE task with a checklist; different actions stay separate tasks.
- **steps** (explicit sequence words only) and **suggested steps** (at most 4, only for big multi-part goals).
  Suggestions are never steps until the person adds them.
- **decision** when the person is undecided: the options, plus a recommendation and one-sentence reason only when
  what they said tips the balance (null otherwise, always null for medical, legal or investment questions). The
  UI labels it "Suggestion" and the person picks freely.
- **priority** also from consequences (a bill that will be cut off), and "low" from "if I have time".

Guardrails in the prompt, each added after a real failure in the eval: never translate or formalize Derja; never
drop a time cue (Latin-letter Derja like "ghodwa" included); a plain "and" between two actions is two tasks; a
repeating task does not get "today" as its day.

**Honest limits.** The eval cases (68) are written by us, so a high score is not a promise about real speech.
Quantities, items and decisions are model judgments and can be wrong, which is why each is editable, and
suggestions and recommendations are labelled as suggestions. Task data saved by older versions is normalized when
loaded (missing fields get safe defaults), after an early build crashed on tasks saved before items existed.

## D14. Feedback for every action

Whenever the person does something, the screen shows what is happening. Dragging to reorder: the card lifts (shadow,
ring, slight tilt) and follows the pointer, a dashed placeholder marks where it will land, neighbours glide aside,
the card eases into its slot on release and its landing spot flashes briefly, with a small vibration on pick-up and
drop, and spoken announcements for screen readers. Deleting: the card slides away before it is removed, with Undo.
Completing: the check draws, then the card fades. Adding: the card springs in. Recording: live waveform, a running
clock, a cancel button. A bug found here: an entrance animation that kept its end state overrode the drag library's
movement, so cards only snapped at the end. Entrance animations must not keep `transform` after they finish.

## D15. Reminders that are hard to miss, without a native app

The app stays a PWA installed from Chrome (no APK). A web app cannot ring like an alarm: no full-screen wake, no
alarm sound, no scheduling on the device. A push can also be delayed or dropped while the phone sleeps, most
often when Android restricts Chrome's battery use. What is done instead:

- **Repeat until answered.** After sending, the server schedules the same reminder again 3 minutes later, twice
  (`REPEATS`, `REPEAT_MS` in `src/lib/server/reminders.ts`). Done on the notification sends `cancel`; Snooze
  replaces the record; opening the app syncs a list that no longer contains it. Any of these stops the repeats.
- **Each copy buzzes** (`renotify` and a long `vibrate` pattern), instead of silently replacing the first.
- **Settings tells Android users** to set Chrome's battery use to Unrestricted. The app cannot change that.

Not verified on a real phone: where the missed reminders were lost (Chrome restricted, or the every-minute
scheduler skipping runs). If reminders are still missed with Chrome unrestricted, check the scheduler first.

## D16. Voice is checked before it is understood

Typed sentences are understood well; spoken Derja often is not, because the speech-to-text step gets words wrong
and the person never saw what was heard. The transcript now goes into the text field (a toast says to check it)
and nothing is created until it is sent. This costs one tap and makes every speech-to-text mistake visible and
fixable. It does not make the speech-to-text itself more accurate; `/dev/stt` is still the place to compare
providers. Voice answers to a clarifying question are unchanged.

## D17. The Done list is a short look back

Finished tasks are deleted 24 hours after they were completed (`DONE_KEEP_MS`), checked on load and every 30
seconds while the app is open. There is no setting for the length yet.

## D18. Why reminders did not arrive with the app closed, and what guarantees them now

**Found on 2026-10-08, with evidence.** Reminders due 5 to 7 minutes earlier were still sitting in the
production store, and stayed there while watched. Calling `/api/cron/fire` once by hand sent them at once
(`sent: 2, failed: 0`). So push worked; nothing was calling the endpoint. The every-minute pinger the design
relied on (cron-job.org, set up by hand) was not running, and nothing in the app said so: Settings showed
"On. Reminders arrive even when the app is closed."

What changed:

- **Callers that need no manual setup.** A GitHub Actions workflow calls once a minute; a daily Vercel cron is
  a safety net; every app sync also sends whatever is due. With `QSTASH_TOKEN` set, the server books a call
  for the exact minute of each reminder (`src/lib/server/schedule.ts`), including repeats and retries.
- **No silent failure.** `/api/push/key` reports `background: "stalled"` when a reminder has waited more than
  2 minutes, or when nothing has triggered the server lately and QStash is not set up. Settings shows it in red.
- **A real test.** "Send a test" also books a reminder through the whole server path one minute later. If it
  arrives with the phone locked, background reminders work.
- **A due reminder is never deleted by a sync.** The app lists only future reminders, so a reminder that had
  just become due looked "no longer wanted" and was removed: with the app alive in the background, it was gone
  before the server sent it. Now a due reminder ends only by itself (after its last repeat) or when the
  person answers (Done sends `cancel`, Snooze replaces it).
- **A failed send is retried** a minute later, up to 5 times, instead of the reminder being deleted.
- **The app does not let go of a sync.** It retries failed syncs, re-syncs every 10 minutes, and syncs at
  once when the page is hidden or closed (`keepalive`), so "add a task, lock the phone" still reaches the
  server.
- **A replaced push address is reported at once** by the service worker (`pushsubscriptionchange`).
- **The page always posts a system notification** for a due reminder, visible or not, so it is in the
  notification list even with no server.

Still true: a web app cannot make Android deliver a push to a browser it has put to sleep. That is what the
Android app (D19) is for.

## D19. The Android app: a thin shell around the live site

**Why.** A browser app cannot schedule anything on the phone. Its reminders depend on a server, a scheduler, a
push service and Android letting a sleeping browser receive the push. The Android app removes all four.

**What it is.** A Capacitor shell (`android/`, `capacitor.config.ts`) whose web view loads
`https://dhakerni.vercel.app`. All the app's code is still the website:

- **Updates need no reinstall.** A deploy reaches every phone the next time the app is opened. A new APK is
  needed only when something native changes: `android/`, `capacitor.config.ts`, or a Capacitor plugin.
- **Reminders are Android alarms** (`src/lib/native/`). Inside the shell the app hands each future reminder to
  `@capacitor/local-notifications`, which uses the system alarm clock (exact, allowed while idle). They ring
  with the phone asleep, the app closed and no internet, and Android restores them after a restart. Web push
  and the server store are not used at all in the app.
- **Done and Snooze** on the notification open the app, which applies them. Finishing, deleting or moving a
  task cancels or moves its alarm.
- The same web code runs in browsers: `isNativeApp()` picks the path. Desktop, iPhone and the Chrome PWA keep
  web push (D18).

**Verified on an emulator (Android 17), 2026-10-08:** the app reports native mode; a task due 75 seconds later
appeared in `dumpsys alarm` as an exact `RTC_WAKEUP` alarm; with the app in the background, the screen off and
the device forced into deep idle, the notification was posted 3 ms after its time, with Done and Snooze; tapping
Done marked the task done in the app. The microphone works in the web view. Not verified: a real phone, and
phone makers that stop background apps aggressively (Xiaomi, Oppo, Huawei); Settings explains the battery
setting for those.

**Known limits.** One notification per reminder (no repeats: the alarm itself is reliable). Exporting a backup
file does not work inside the app yet (the web view does not handle the download); use the browser for that.
Tasks are stored per app: the Chrome version and the Android app do not share them (use Export in Chrome, then
Import in the app).

**Building and publishing.** `npm run android:apk` (needs JDK 21 and the Android SDK: `JAVA_HOME`,
`ANDROID_HOME`) writes `dhakerni.apk`. It is signed with the key in `~/dhakerni-keystore/`, which is not in the
repository. **Back that folder up**: an update signed with any other key cannot be installed over the app.
Publish by attaching `dhakerni.apk` to a GitHub release; Settings links to the latest one for Android browsers.
