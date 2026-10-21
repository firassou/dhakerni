import { JoinBody } from "@/lib/partner/shared";
import { failure, open } from "@/lib/server/pair-http";
import { joinInvite } from "@/lib/server/pairing";

export const dynamic = "force-dynamic";

/** Uses a code. Guessing is throttled hard: eight tries a minute per device, forty per hour. */
export async function POST(req: Request) {
  const o = await open(req, "pair-join", [
    { name: "min", max: 8, windowSec: 60 },
    { name: "hour", max: 40, windowSec: 3600 },
  ]);
  if (o instanceof Response) return o;
  const body = JoinBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return failure("invalid_code");
  const joined = await joinInvite(o.kv, o.sid, body.data.code);
  return "error" in joined ? failure(joined.error) : Response.json(joined);
}
