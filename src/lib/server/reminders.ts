import { z } from "zod";
import { decrypt, encrypt } from "./crypto";

/**
 * What the server keeps, and nothing else: the push subscription, the anonymous session id, the time a
 * reminder fires, and a short title. Everything is encrypted at rest and each reminder is deleted the
 * moment it fires.
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

export const SyncBody = z.object({
  subscription: Subscription,
  /** replace: this list is the whole truth for the session. upsert: only add or update these. */
  mode: z.enum(["replace", "upsert"]).default("replace"),
  /** Turning reminders off: delete the stored subscription and everything scheduled. */
  forget: z.boolean().default(false),
  reminders: z
    .array(
      z.object({
        taskId: z.string().min(1).max(64),
        fireAt: z.iso.datetime({ offset: true }),
        title: z.string().max(400),
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
}

const SUB_TTL = 60 * 86_400;
const shorten = (s: string) => (s.length > MAX_TITLE ? `${s.slice(0, MAX_TITLE - 1)}…` : s);

export async function syncReminders(store: ReminderStore, sid: string, body: SyncBody, now: Date) {
  if (body.forget) {
    for (const id of await store.listTaskIds(sid)) await store.delReminder(sid, id);
    await store.delSub(sid);
    return;
  }
  await store.putSub(sid, encrypt(JSON.stringify(body.subscription)), SUB_TTL);

  const keep = new Set<string>();
  for (const r of body.reminders) {
    const at = Date.parse(r.fireAt);
    if (at - now.getTime() > MAX_AHEAD_MS) continue;
    keep.add(r.taskId);
    const enc = encrypt(
      JSON.stringify({ taskId: r.taskId, fireAt: r.fireAt, title: shorten(r.title) }),
    );
    // Keep the record a day past its time so a late cron run can still send it.
    const ttl = Math.max(60, Math.ceil((at - now.getTime()) / 1000) + 86_400);
    await store.putReminder(sid, r.taskId, enc, at, ttl);
  }
  if (body.mode === "replace") {
    for (const id of await store.listTaskIds(sid))
      if (!keep.has(id)) await store.delReminder(sid, id);
  }
}

export interface PushPayload {
  taskId: string;
  title: string;
  fireAt: string;
}
export type Sender = (sub: Subscription, payload: PushPayload) => Promise<void>;

export interface FireReport {
  sent: number;
  failed: number;
  dropped: number;
}

/** Sends everything that is due, then deletes it. A dead subscription (404/410) is forgotten too. */
export async function fireDue(store: ReminderStore, send: Sender, now: Date): Promise<FireReport> {
  const report: FireReport = { sent: 0, failed: 0, dropped: 0 };
  for (const { sid, taskId } of await store.claimDue(now.getTime(), 100)) {
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
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await store.delSub(sid);
        report.failed++;
      }
    } catch {
      report.dropped++;
    } finally {
      // Delete after firing, whatever happened: the server keeps nothing it no longer needs.
      await store.delReminder(sid, taskId);
    }
  }
  return report;
}
