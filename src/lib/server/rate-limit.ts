import { Redis } from "@upstash/redis";

/**
 * Fixed-window counter, per key. Uses Upstash Redis when configured so limits hold across
 * serverless instances; falls back to process memory for local development.
 */
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const memory = new Map<string, { count: number; resetAt: number }>();

export interface Limit {
  name: string;
  max: number;
  windowSec: number;
}

async function hit(key: string, windowSec: number): Promise<number> {
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSec);
      return count;
    } catch (e) {
      console.error("rate-limit redis failed, using memory", e);
    }
  }
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return 1;
  }
  return ++entry.count;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks the per-session limits and a looser per-IP limit (a fabricated session id
 * should not buy unlimited calls). Returns null when allowed, or a 429 Response.
 */
export async function enforce(
  req: Request,
  route: string,
  limits: Limit[],
): Promise<Response | null> {
  const session = req.headers.get("x-session-id") ?? "";
  if (!UUID.test(session)) {
    return Response.json({ error: "missing_session" }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  for (const l of limits) {
    const bucket = Math.floor(Date.now() / (l.windowSec * 1000));
    const [s, i] = await Promise.all([
      hit(`rl:${route}:${l.name}:s:${session}:${bucket}`, l.windowSec),
      hit(`rl:${route}:${l.name}:ip:${ip}:${bucket}`, l.windowSec),
    ]);
    if (s > l.max || i > l.max * 5) {
      return Response.json(
        { error: "rate_limited", retryAfterSec: l.windowSec },
        { status: 429, headers: { "retry-after": String(l.windowSec) } },
      );
    }
  }
  return null;
}
