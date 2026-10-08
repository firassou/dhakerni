# Dhakerni (ذكّرني)

Voice-first todo and reminder app for Tunisian Arabic (Derja), French and English. You speak or type;
it turns what you said into tasks and reminders.

Status: **v0.8.0**: voice and typed capture that understands the idea (clean titles, descriptions, quantities,
checklists, steps, decision help), clarifying questions, reminders with Web Push, a visible learned profile,
backup, prayer-time words, an opening animation, accessibility checks. See [CHANGELOG](CHANGELOG.md). See [CHANGELOG](CHANGELOG.md).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys (see below)
npm run dev                  # http://localhost:3000
npm test                     # unit tests
npm run test:e2e             # Playwright (run `npx playwright install chromium` once)
npm run eval                 # parser accuracy on evals/cases.json (uses real API calls)
# /dev/stt (dev only): record once, compare speech-to-text providers
```

## Testing

| Command                            | What it checks                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                         | Unit tests: time resolution, learning rules, reminders, encryption, backup, prayer times                                                  |
| `npm run test:e2e`                 | Playwright on a phone and a desktop browser: voice (fake microphone), questions, memory, push settings, keyboard, WCAG AA with axe, speed |
| `npm run eval`                     | Parser accuracy on 68 utterances (real API calls)                                                                                         |
| `node scripts/live-push-check.mjs` | Real Web Push round trip in Google Chrome (needs `npm run dev:cron`)                                                                      |

## Environment variables

| Name                                                 | Used for                        | From              |
| ---------------------------------------------------- | ------------------------------- | ----------------- |
| `GOOGLE_GENERATIVE_AI_API_KEY`                       | LLM extraction / STT candidate  | Google AI Studio  |
| `ELEVENLABS_API_KEY`                                 | STT candidate                   | ElevenLabs        |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Encrypted reminder store (v0.6) | Upstash           |
| `VAPID_*`, `REMINDER_ENCRYPTION_KEY`                 | Web Push and encryption (v0.6)  | generated locally |

Keys are read only in server routes and never sent to the client.

## Deploying (Vercel)

1. Import the repo. Add every variable above in Project Settings, Environment Variables (Production). Without the
   Upstash, VAPID, `REMINDER_ENCRYPTION_KEY` and `CRON_SECRET` variables the app still works, but background
   reminders are off and Settings says so.
2. Deploy from `main`. Use the production domain: preview deployments sit behind Vercel Authentication, which blocks
   the manifest and service worker.
3. **Scheduler.** The app is serverless: nothing sends a reminder unless something calls
   `/api/cron/fire` when it is due. Without a caller, reminders only show while the app is open (Settings then
   shows a red warning). There are three callers, and any one is enough:
   - **GitHub Actions** (`.github/workflows/reminders.yml`): calls once a minute. Set the repository secret
     `CRON_SECRET` to the same value as in Vercel (`gh secret set CRON_SECRET`). GitHub can start a run a few
     minutes late, so reminders may be a few minutes late with this alone.
   - **Upstash QStash** (recommended, exact to the second): in the Upstash console open QStash, copy
     `QSTASH_TOKEN` (and `QSTASH_URL` if it shows one) into Vercel's environment variables, and redeploy. The
     server then books a call for the exact minute of every reminder. Free plan: 1,000 calls a day.
   - **The daily Vercel cron** (`vercel.json`): a safety net that needs no setup.

   cron-job.org (a job on `https://YOUR-DOMAIN/api/cron/fire` every minute with the header
   `Authorization: Bearer <CRON_SECRET>`) also works as a caller.

4. Open the site on each device, Settings, Notifications, Turn on. On iPhone, add it to the Home Screen first.

Check a deployment end to end with real Chrome: `APP_URL=https://YOUR-DOMAIN node scripts/live-push-check.mjs`.

## Architecture

Local-first. Tasks, settings and the learned profile live in IndexedDB on the device. The server is a
thin layer: an AI route (audio/text to validated JSON, rate-limited per session) and a reminder store.
Design: [docs/design-notes.md](docs/design-notes.md). Decisions and push strategy:
[docs/decisions.md](docs/decisions.md).

## Learning

Dhakerni learns how you speak and work, and shows all of it on one screen (Settings, "What Dhakerni knows about
you"): edit, delete, "Forget everything", or switch learning off. What is learned, when it starts to count and how
corrections work is in [docs/decisions.md](docs/decisions.md) (D9).

## Privacy model

- Tasks, notes and everything Dhakerni learns about you stay on your device.
- There are no accounts. A random anonymous ID is created on first launch.
- For reminders when the app is closed, the server stores only: push subscription, anonymous ID,
  reminder fire time and a short title (cut to 80 characters). It is AES-256-GCM encrypted at rest, each reminder
  is deleted right after it is sent, and turning notifications off deletes the rest. Nothing is stored for
  people who leave notifications off.
- Audio and text you send for parsing go to the AI provider to be processed. Only the few trusted profile facts
  that matter for that sentence go with it, never the whole profile.
- Export and import work on a JSON file you control. The file leaves out the anonymous ID and push subscription.
