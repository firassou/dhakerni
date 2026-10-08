import { z } from "zod";
import { decrypt, encrypt } from "./crypto";

/**
 * What the server keeps, and nothing else: the push subscription, the anonymous session id, the time a
 * reminder fires, and a short title. Everything is encrypted at rest. A reminder is deleted once it is
 * answered (Done or Snooze), or after its last repeat.
 *
 * Nothing here runs by itself: something has to call fireDue when a reminder is due. See schedule.ts for
 * the triggers, and `health` for how the app tells the person when none of them is working.
 */

/** Only real push services. Without this, anyone could make the server POST to any URL. */
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];
const isPushEndpoint = (value: string) => {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
    );
  } catch {
    return false;
  }
};

export const Subscription = z.object({
  endpoint: z.string().max(1024).refine(isPushEndpoint, "not a known push service"),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});
export type Subscription = z.infer<typeof Subscription>;

export const MAX_TITLE = 80;
export const MAX_REMINDERS = 200;
const MAX_AHEAD_MS = 400 * 86_400_000;
/** A reminder nobody answers is sent again: a phone asleep can delay or drop a single push. */
export const REPEATS = 2;
export const REPEAT_MS = 3 * 60_000;
/** A push the push service refused for a passing reason (network, 429, 5xx) is tried again, not lost. */
export const SEND_RETRIES = 5;
export const RETRY_MS = 60_000;
/** How far ahead an exact wake-up call is booked. Later reminders are booked by the daily run. */
export const ARM_AHEAD_MS = 3 * 86_400_000;
/** A reminder already past its time is still accepted from the app if it is at most this late. */
const LATE_ACCEPT_MS = 60_000;
/** A reminder this late means nothing is triggering the server. */
export const STALLED_MS = 2 * 60_000;

export const SyncBody = z.object({
  subscription: Subscription,
  /** replace: this list is the whole truth for the session. upsert: only add or update these. */
  mode: z.enum(["replace", "upsert"]).default("replace"),
  /** Turning reminders off: delete the stored subscription and everything scheduled. */
  forget: z.boolean().default(false),
  /** Answered from the notification (Done): stop repeating these. */
  cancel: z.array(z.string().min(1).max(64)).max(MAX_REMINDERS).default([]),
  reminders: z
    .array(
      z.object({
        taskId: z.string().min(1).max(64),
        fireAt: z.iso.datetime({ offset: true }),
        title: z.string().max(400),
        /** Sent a single time, never repeated (the test reminder). */
        once: z.boolean().optional(),
      }),
    )
    .max(MAX_REMINDERS),
});
export type SyncBody = z.infer<typeof SyncBody>;

export interface ReminderStore {
  putSub(sid: string, enc: string, ttlSec: number): Promise<void>;
  getSub(sid: string): Promise<string | null>;
  delSub(sid: string): Promise<void>;
  putReminder(
    sid: string,
    taskId: string,
    enc: string,
    fireAtMs: number,
    ttlSec: number,
  ): Promise<void>;
  getReminder(sid: string, taskId: string): Promise<string | null>;
  listTaskIds(sid: string): Promise<string[]>;
  delReminder(sid: string, taskId: string): Promise<void>;
  /** Atomically takes ownership of reminders due by `nowMs`; two callers never get the same one. */
  claimDue(nowMs: number, limit: number): Promise<{ sid: string; taskId: string }[]>;
  /** Fire times (epoch ms) of reminders due in [fromMs, toMs], earliest first. */
  dueTimes(fromMs: number, toMs: number, limit: number): Promise<number[]>;
  /** True for the first caller only, until the key expires. */
  markOnce(key: string, ttlSec: number): Promise<boolean>;
  unmark(key: string): Promise<void>;
  /** When fireDue last ran (epoch ms), so the app can tell whether anything is triggering the server. */
  beat(nowMs: number): Promise<void>;
  lastBeat(): Promise<number | null>;
}

/** Books a call to the fire endpoint at `atMs`. Null when no exact scheduler is configured. */
export type Scheduler = ((atMs: number) => Promise<void>) | null;

/**
 * Books one wake-up call for the minute a reminder falls in. Many reminders in the same minute, or the
 * same reminder synced again and again, book a single call.
 */
export async function arm(store: ReminderStore, schedule: Scheduler, atMs: number, now: Date) {
  if (!schedule || atMs - now.getTime() > ARM_AHEAD_MS) return;
  const minute = Math.ceil(Math.max(atMs, now.getTime()) / 60_000);
  const key = `armed:${minute}`;
  const ttl = Math.max(120, Math.ceil((minute * 60_000 - now.getTime()) / 1000) + 120);
  if (!(await store.markOnce(key, ttl))) return;
  try {
    // A second after the reminder's own time, so it is already due when the call arrives.
    await schedule(Math.max(atMs, now.getTime()) + 1000);
  } catch (e) {
    await store.unmark(key); // not booked: let the next sync or run try again
    console.error("could not book a wake-up call", e instanceof Error ? e.message : e);
  }
}

/** Books wake-up calls for everything due soon. Run now and then, it covers reminders set far ahead. */
export async function armUpcoming(store: ReminderStore, schedule: Scheduler, now: Date) {
  if (!schedule) return;
  const t = now.getTime();
  for (const at of await store.dueTimes(t, t + ARM_AHEAD_MS, 500))
    await arm(store, schedule, at, now);
}

export interface Health {
  /** Milliseconds the oldest due reminder has been waiting. 0 when nothing is waiting. */
  lateMs: number;
  /** When the server last looked for due reminders. */
  lastRunMs: number | null;
}

export async function health(store: ReminderStore, now: Date): Promise<Health> {
  const [oldest] = await store.dueTimes(0, now.getTime(), 1);
  return {
    lateMs: oldest === undefined ? 0 : now.getTime() - oldest,
    lastRunMs: await store.lastBeat(),
  };
}

const SUB_TTL = 60 * 86_400;
const shorten = (s: string) => (s.length > MAX_TITLE ? `${s.slice(0, MAX_TITLE - 1)}…` : s);

export async function syncReminders(
  store: ReminderStore,
  sid: string,
  body: SyncBody,
  now: Date,
  schedule: Scheduler = null,
) {
  const due = async (taskId: string) => {
    const enc = await store.getReminder(sid, taskId);
    if (!enc) return false;
    try {
      return Date.parse((JSON.parse(decrypt(enc)) as PushPayload).fireAt) <= now.getTime();
    } catch {
      return false;
    }
  };

  if (body.forget) {
    for (const id of await store.listTaskIds(sid)) await store.delReminder(sid, id);
    await store.delSub(sid);
    return;
  }
  await store.putSub(sid, encrypt(JSON.stringify(body.subscription)), SUB_TTL);
  for (const id of body.cancel) await store.delReminder(sid, id);

  const keep = new Set<string>();
  for (const r of body.reminders) {
    const at = Date.parse(r.fireAt);
    if (at - now.getTime() > MAX_AHEAD_MS) continue;
    keep.add(r.taskId);
    if (at <= now.getTime()) {
      // Already due and already here: it is being sent or repeated. Rewriting it would start it over.
      if (await due(r.taskId)) continue;
      // Due a while ago and not here: it was sent and finished. Only a reminder that became due this
      // very moment (the clocks of the phone and the server differ a little) is still taken.
      if (now.getTime() - at > LATE_ACCEPT_MS) continue;
    }
    const enc = encrypt(
      JSON.stringify({
        taskId: r.taskId,
        fireAt: r.fireAt,
        title: shorten(r.title),
        ...(r.once ? { attempt: REPEATS } : {}),
      }),
    );
    // Keep the record a day past its time so a late cron run can still send it.
    const ttl = Math.max(60, Math.ceil((at - now.getTime()) / 1000) + 86_400);
    await store.putReminder(sid, r.taskId, enc, at, ttl);
    await arm(store, schedule, at, now);
  }
  if (body.mode === "replace") {
    for (const id of await store.listTaskIds(sid)) {
      if (keep.has(id)) continue;
      // The app lists only future reminders. One that is due is not "no longer wanted": it is about to be
      // sent, or is repeating. It ends by itself, or when the person answers (cancel).
      if (await due(id)) continue;
      await store.delReminder(sid, id);
    }
  }
}

export interface PushPayload {
  taskId: string;
  title: string;
  fireAt: string;
  /** How many times it was already sent. Absent on the first send. */
  attempt?: number;
  /** How many sends failed for a passing reason. */
  fails?: number;
}
export type Sender = (sub: Subscription, payload: PushPayload) => Promise<void>;

export interface FireReport {
  sent: number;
  failed: number;
  dropped: number;
}

/**
 * Sends everything that is due. Each reminder is then scheduled again a few minutes later, up to REPEATS
 * times, and deleted after the last one (the client cancels it sooner when the person answers).
 * A send that fails for a passing reason is tried again a minute later, up to SEND_RETRIES times.
 * A dead subscription (404/410) is forgotten, with its reminder.
 */
export async function fireDue(
  store: ReminderStore,
  send: Sender,
  now: Date,
  schedule: Scheduler = null,
): Promise<FireReport> {
  const report: FireReport = { sent: 0, failed: 0, dropped: 0 };
  const later = async (sid: string, payload: PushPayload, delayMs: number) => {
    const at = now.getTime() + delayMs;
    await store.putReminder(sid, payload.taskId, encrypt(JSON.stringify(payload)), at, 3600);
    await arm(store, schedule, at, now);
  };
  for (const { sid, taskId } of await store.claimDue(now.getTime(), 100)) {
    let again = false;
    try {
      const [encR, encS] = await Promise.all([store.getReminder(sid, taskId), store.getSub(sid)]);
      if (!encR || !encS) {
        report.dropped++;
        continue;
      }
      const payload = JSON.parse(decrypt(encR)) as PushPayload;
      const sub = Subscription.parse(JSON.parse(decrypt(encS)));
      try {
        await send(sub, payload);
        report.sent++;
        const attempt = payload.attempt ?? 0;
        if (attempt < REPEATS) {
          await later(sid, { ...payload, attempt: attempt + 1, fails: 0 }, REPEAT_MS);
          again = true;
        }
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        report.failed++;
        const fails = (payload.fails ?? 0) + 1;
        if (status === 404 || status === 410) await store.delSub(sid);
        else if (fails <= SEND_RETRIES) {
          await later(sid, { ...payload, fails }, RETRY_MS);
          again = true;
        }
      }
    } catch {
      report.dropped++;
    } finally {
      // Unless it comes back, delete after firing: the server keeps nothing it no longer needs.
      if (!again) await store.delReminder(sid, taskId);
    }
  }
  await store.beat(now.getTime());
  return report;
}
