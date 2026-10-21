import { openPaired } from "@/lib/server/pair-http";
import { inbox } from "@/lib/server/pairing";

export const dynamic = "force-dynamic";

/** Tasks the partner sent that this device has not taken yet. They stay until acknowledged. */
export async function GET(req: Request) {
  const o = await openPaired(req, "share-inbox", [{ name: "min", max: 30, windowSec: 60 }]);
  if (o instanceof Response) return o;
  return Response.json(
    { items: await inbox(o.kv, o.sid) },
    { headers: { "cache-control": "no-store" } },
  );
}
