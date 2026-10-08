import type { Scheduler } from "./reminders";

/**
 * What makes the server look for due reminders. A serverless app cannot wake itself, so each of these is an
 * outside caller of /api/cron/fire, and they are layered on purpose: any one of them is enough.
 *
 * 1. QStash (this file): a call booked for the exact minute of each reminder. On when QSTASH_TOKEN is set.
 * 2. A minute-by-minute pinger: the GitHub Actions workflow in .github/workflows, or cron-job.org.
 * 3. The daily Vercel cron (vercel.json): a safety net that also books calls for far-off reminders.
 * 4. Any app that syncs: /api/reminders sends whatever is due while it is there.
 *
 * Settings shows a warning when a reminder has been waiting too long, so a silent failure cannot hide.
 */

/** The public address QStash should call. Local servers cannot be reached from outside. */
function publicOrigin(requestUrl: string): string | null {
  const fromEnv =
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);
  const origin = fromEnv ?? new URL(requestUrl).origin;
  const { protocol, hostname } = new URL(origin);
  return protocol === "https:" && hostname !== "localhost" ? origin.replace(/\/$/, "") : null;
}

export const qstashConfigured = () => !!(process.env.QSTASH_TOKEN && process.env.CRON_SECRET);

export function qstashScheduler(requestUrl: string): Scheduler {
  const origin = publicOrigin(requestUrl);
  if (!qstashConfigured() || !origin) return null;
  const base = (process.env.QSTASH_URL ?? "https://qstash.upstash.io").replace(/\/$/, "");
  return async (atMs) => {
    const res = await fetch(`${base}/v2/publish/${origin}/api/cron/fire`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
        "upstash-method": "POST",
        "upstash-not-before": String(Math.ceil(atMs / 1000)),
        "upstash-retries": "3",
        // Handed on to our endpoint as its Authorization header.
        "upstash-forward-authorization": `Bearer ${process.env.CRON_SECRET}`,
      },
    });
    if (!res.ok) throw new Error(`qstash ${res.status}`);
  };
}
