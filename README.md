# Dhakerni (ذكّرني)

Voice-first todo and reminder app for Tunisian Arabic (Derja), French and English. You speak or type;
it turns what you said into tasks and reminders.

Status: **v0.5.0**: tasks, voice and typed capture, clarifying questions, reminders with Web Push. The memory
screen, export/import and polish arrive in v0.6 and v0.7. See [CHANGELOG](CHANGELOG.md).

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
3. **Scheduler.** Vercel Cron on the free Hobby plan runs once a day at most, so use a free external pinger. On
   cron-job.org create a job: URL `https://YOUR-DOMAIN/api/cron/fire`, every 1 minute, with the header
   `Authorization: Bearer <your CRON_SECRET>`. (On Vercel Pro you can use a cron entry instead; Vercel sends the
   same header automatically when `CRON_SECRET` is set.)
4. Open the site on each device, Settings, Notifications, Turn on. On iPhone, add it to the Home Screen first.

Check a deployment end to end with real Chrome: `APP_URL=https://YOUR-DOMAIN node scripts/live-push-check.mjs`.

## Architecture

Local-first. Tasks, settings and the learned profile live in IndexedDB on the device. The server is a
thin layer: an AI route (audio/text to validated JSON, rate-limited per session) and a reminder store.
Design: [docs/design-notes.md](docs/design-notes.md). Decisions and push strategy:
[docs/decisions.md](docs/decisions.md).

## Privacy model

- Tasks, notes and everything Dhakerni learns about you stay on your device.
- There are no accounts. A random anonymous ID is created on first launch.
- For reminders when the app is closed, the server stores only: push subscription, anonymous ID,
  reminder fire time and a short title (cut to 80 characters). It is AES-256-GCM encrypted at rest, each reminder
  is deleted right after it is sent, and turning notifications off deletes the rest. Nothing is stored for
  people who leave notifications off.
- Audio and text you send for parsing go to the AI provider to be processed. Only the minimal slice of
  your profile needed for that request is included.
