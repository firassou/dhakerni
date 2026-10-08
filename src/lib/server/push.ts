import webpush from "web-push";
import type { Sender } from "./reminders";

export const pushConfigured = () =>
  !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.REMINDER_ENCRYPTION_KEY
  );

export const sendPush: Sender = async (sub, payload) => {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  // TTL: if the device is offline, the push service keeps it for up to an hour.
  await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
};
