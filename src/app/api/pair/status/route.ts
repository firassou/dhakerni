import { open } from "@/lib/server/pair-http";
import { status } from "@/lib/server/pairing";

export const dynamic = "force-dynamic";

/** Asked by the device that made the invitation: has the partner joined? Hands over its token once. */
export async function GET(req: Request) {
  const o = await open(req, "pair-status", [{ name: "min", max: 30, windowSec: 60 }]);
  if (o instanceof Response) return o;
  return Response.json(await status(o.kv, o.sid), { headers: { "cache-control": "no-store" } });
}
