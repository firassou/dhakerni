import { timingSafeEqual } from "node:crypto";
import { sendPush } from "@/lib/server/push";
import { fireDue } from "@/lib/server/reminders";
import { getStore } from "@/lib/server/store";

export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Called every minute by a scheduler (see README). Sends due reminders and deletes them. */
async function run(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const store = getStore();
  if (!store) return Response.json({ error: "push_unavailable" }, { status: 503 });
  return Response.json(await fireDue(store, sendPush, new Date()));
}

export const GET = run;
export const POST = run;
