import webpush from "web-push";
import type { Sender, Subscription } from "./reminders";

export const pushConfigured = () =>
  !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.REMINDER_ENCRYPTION_KEY
  );

/** Any JSON payload to a push subscription. Reminders and "your partner sent you a task" share this. */
export async function sendRaw(sub: Subscription, payload: object): Promise<void> {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  // TTL: if the device is offline, the push service keeps it for up to an hour.
  await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
}

export const sendPush: Sender = (sub, payload) => sendRaw(sub, payload);
