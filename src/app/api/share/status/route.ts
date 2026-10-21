import { StatusBody } from "@/lib/partner/shared";
import { failure, openPaired } from "@/lib/server/pair-http";
import { sendStatus } from "@/lib/server/pairing";
import { pushConfigured, sendRaw } from "@/lib/server/push";
import { decrypt } from "@/lib/server/crypto";
import { Subscription } from "@/lib/server/reminders";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/**
 * One side finished or reopened a shared task: leave a note in the other side's inbox. A finish also pushes,
 * so the sender hears about it ("Sami finished it") with the app closed.
 */
export async function POST(req: Request) {
  const o = await openPaired(req, "share-status", [{ name: "min", max: 40, windowSec: 60 }]);
  if (o instanceof Response) return o;
  const body = StatusBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return failure("bad_request");

  await sendStatus(o.kv, o.partnerSid, body.data.shareId, body.data.done, new Date());

  const store = getStore();
  if (body.data.done && store && pushConfigured()) {
    try {
      const enc = await store.getSub(o.partnerSid);
      if (enc) {
        const sub = Subscription.parse(JSON.parse(decrypt(enc)));
        await sendRaw(sub, { kind: "finished", title: body.data.title });
      }
    } catch (e) {
      console.error("partner push failed", e instanceof Error ? e.message : e);
    }
  }
  return Response.json({ ok: true });
}
