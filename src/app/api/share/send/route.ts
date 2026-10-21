import { SendBody } from "@/lib/partner/shared";
import { failure, openPaired } from "@/lib/server/pair-http";
import { send } from "@/lib/server/pairing";
import { pushConfigured, sendRaw } from "@/lib/server/push";
import { Subscription } from "@/lib/server/reminders";
import { decrypt } from "@/lib/server/crypto";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/**
 * Puts a task in the partner's inbox and nudges their phone. The task lands on their list by itself; the
 * push only wakes the device up (and works as the notification). Without push the partner still gets it
 * the next time the app is open.
 */
export async function POST(req: Request) {
  const o = await openPaired(req, "share-send", [
    { name: "min", max: 20, windowSec: 60 },
    { name: "day", max: 200, windowSec: 86_400 },
  ]);
  if (o instanceof Response) return o;
  const body = SendBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return failure("bad_request");

  const sent = await send(o.kv, o.partnerSid, body.data.task, new Date());
  if ("error" in sent) return failure(sent.error);

  let notified = false;
  const store = getStore();
  if (store && pushConfigured()) {
    try {
      const enc = await store.getSub(o.partnerSid);
      if (enc) {
        const sub = Subscription.parse(JSON.parse(decrypt(enc)));
        await sendRaw(sub, { kind: "assigned", title: body.data.task.title.slice(0, 80) });
        notified = true;
      }
    } catch (e) {
      console.error("partner push failed", e instanceof Error ? e.message : e);
    }
  }
  return Response.json({ ok: true, notified, id: sent.id });
}
