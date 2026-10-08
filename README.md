# Dhakerni (ذكّرني)

Voice-first todo and reminder app for Tunisian Arabic (Derja), French and English. You speak or type;
it turns what you said into tasks and reminders.

Status: **v0.1.0 foundation** (shell, i18n/RTL, local storage, PWA). Voice, parsing, memory and push
arrive in v0.2 to v0.7. See [CHANGELOG](CHANGELOG.md).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys (see below)
npm run dev                  # http://localhost:3000
npm test                     # unit tests
npm run test:e2e             # Playwright (run `npx playwright install chromium` once)
```

## Environment variables

| Name                                                 | Used for                        | From              |
| ---------------------------------------------------- | ------------------------------- | ----------------- |
| `GOOGLE_GENERATIVE_AI_API_KEY`                       | LLM extraction / STT candidate  | Google AI Studio  |
| `ELEVENLABS_API_KEY`                                 | STT candidate                   | ElevenLabs        |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Encrypted reminder store (v0.6) | Upstash           |
| `VAPID_*`, `REMINDER_ENCRYPTION_KEY`                 | Web Push and encryption (v0.6)  | generated locally |

Keys are read only in server routes and never sent to the client.

## Architecture

Local-first. Tasks, settings and the learned profile live in IndexedDB on the device. The server is a
thin layer: an AI route (audio/text to validated JSON, rate-limited per session) and a reminder store.
Design: [docs/design-notes.md](docs/design-notes.md). Decisions and push strategy:
[docs/decisions.md](docs/decisions.md).

## Privacy model

- Tasks, notes and everything Dhakerni learns about you stay on your device.
- There are no accounts. A random anonymous ID is created on first launch.
- For reminders when the app is closed, the server stores only: push subscription, anonymous ID,
  reminder fire time and a short title. It is encrypted at rest and deleted after the reminder fires.
- Audio and text you send for parsing go to the AI provider to be processed. Only the minimal slice of
  your profile needed for that request is included.
