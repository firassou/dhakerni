import { openPaired } from "@/lib/server/pair-http";
import { leave } from "@/lib/server/pairing";

export const dynamic = "force-dynamic";

/** Unpairs both devices and throws away whatever was still waiting in either inbox. */
export async function POST(req: Request) {
  const o = await openPaired(req, "pair-leave", [{ name: "min", max: 6, windowSec: 60 }]);
  if (o instanceof Response) return o;
  await leave(o.kv, o.sid, o.partnerSid);
  return Response.json({ ok: true });
}
