import { open, failure } from "@/lib/server/pair-http";
import { createInvite } from "@/lib/server/pairing";

export const dynamic = "force-dynamic";

/** Starts a pairing: a single-use code (and link) the other person opens within ten minutes. */
export async function POST(req: Request) {
  const o = await open(req, "pair-create", [{ name: "min", max: 6, windowSec: 60 }]);
  if (o instanceof Response) return o;
  const made = await createInvite(o.kv, o.sid);
  return "error" in made ? failure(made.error) : Response.json(made);
}
