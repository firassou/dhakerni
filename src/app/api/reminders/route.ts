import { pushConfigured } from "@/lib/server/push";
import { enforce } from "@/lib/server/rate-limit";
import { SyncBody, syncReminders } from "@/lib/server/reminders";
import { getStore } from "@/lib/server/store";

export async function POST(req: Request) {
  const limited = await enforce(req, "reminders", [{ name: "min", max: 60, windowSec: 60 }]);
  if (limited) return limited;
  const store = getStore();
  if (!store || !pushConfigured())
    return Response.json({ error: "push_unavailable" }, { status: 503 });

  const body = SyncBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "bad_request" }, { status: 400 });

  await syncReminders(store, req.headers.get("x-session-id")!, body.data, new Date());
  return Response.json({ ok: true });
}
