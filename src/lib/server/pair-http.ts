import { enforce, type Limit } from "./rate-limit";
import { getKv, type Kv } from "./kv";
import { verify } from "./pairing";

export const unavailable = () => Response.json({ error: "unavailable" }, { status: 503 });

/** Rate limit, storage present, and the session id header. Returns the pieces, or the Response to send. */
export async function open(
  req: Request,
  route: string,
  limits: Limit[],
): Promise<{ kv: Kv; sid: string } | Response> {
  const limited = await enforce(req, route, limits);
  if (limited) return limited;
  const kv = getKv();
  if (!kv) return unavailable();
  return { kv, sid: req.headers.get("x-session-id")! };
}

/** Like `open`, and the caller must also hold this device's pair token. 401 means "not paired (any more)". */
export async function openPaired(
  req: Request,
  route: string,
  limits: Limit[],
): Promise<{ kv: Kv; sid: string; partnerSid: string } | Response> {
  const o = await open(req, route, limits);
  if (o instanceof Response) return o;
  const partnerSid = await verify(o.kv, o.sid, req.headers.get("x-pair-token") ?? "");
  if (!partnerSid) return Response.json({ error: "not_paired" }, { status: 401 });
  return { ...o, partnerSid };
}

const STATUS: Record<string, number> = {
  already_paired: 409,
  invalid_code: 404,
  own_code: 400,
  not_paired: 401,
  inbox_full: 429,
};
export const failure = (error: string) =>
  Response.json({ error }, { status: STATUS[error] ?? 400 });
