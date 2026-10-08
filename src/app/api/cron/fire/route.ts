import { timingSafeEqual } from "node:crypto";
import { sendPush } from "@/lib/server/push";
import { armUpcoming, fireDue } from "@/lib/server/reminders";
import { qstashScheduler } from "@/lib/server/schedule";
import { getStore } from "@/lib/server/store";

export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Called by whatever triggers the server (see lib/server/schedule.ts). Sends everything that is due. */
async function run(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const store = getStore();
  if (!store) return Response.json({ error: "push_unavailable" }, { status: 503 });
  const now = new Date();
  const schedule = qstashScheduler(req.url);
  const report = await fireDue(store, sendPush, now, schedule);
  // Now and then, book exact calls for what is coming: reminders set far ahead were not booked when made.
  if (schedule && (await store.markOnce("armscan", 6 * 3600)))
    await armUpcoming(store, schedule, now);
  return Response.json(report);
}

export const GET = run;
export const POST = run;
