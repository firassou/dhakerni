import { AckBody } from "@/lib/partner/shared";
import { failure, openPaired } from "@/lib/server/pair-http";
import { ack } from "@/lib/server/pairing";

export const dynamic = "force-dynamic";

/** The device has saved these tasks: the server deletes its copy. */
export async function POST(req: Request) {
  const o = await openPaired(req, "share-ack", [{ name: "min", max: 30, windowSec: 60 }]);
  if (o instanceof Response) return o;
  const body = AckBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return failure("bad_request");
  await ack(o.kv, o.sid, body.data.ids);
  return Response.json({ ok: true });
}
