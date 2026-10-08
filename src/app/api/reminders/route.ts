import { enforce } from "@/lib/server/rate-limit";
import { pushConfigured, sendPush } from "@/lib/server/push";
import { fireDue, SyncBody, syncReminders } from "@/lib/server/reminders";
import { qstashScheduler } from "@/lib/server/schedule";
import { getStore } from "@/lib/server/store";

export async function POST(req: Request) {
  const limited = await enforce(req, "reminders", [{ name: "min", max: 60, windowSec: 60 }]);
  if (limited) return limited;
  const store = getStore();
  if (!store || !pushConfigured())
    return Response.json({ error: "push_unavailable" }, { status: 503 });

  const body = SyncBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const now = new Date();
  const schedule = qstashScheduler(req.url);
  await syncReminders(store, req.headers.get("x-session-id")!, body.data, now, schedule);
  // While we are here: send anything that is due, for anyone. One more thing that keeps reminders moving.
  await fireDue(store, sendPush, now, schedule).catch((e) =>
    console.error("fire on sync failed", e),
  );
  return Response.json({ ok: true });
}
