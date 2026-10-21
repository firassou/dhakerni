import { Redis } from "@upstash/redis";

/**
 * The small key/value surface pairing and sharing need. Values are always strings (the callers store
 * encrypted text), prefixed so Upstash never mistakes one for a number or JSON on the way back.
 */
export interface Kv {
  set(key: string, value: string, ttlSec: number): Promise<void>;
  get(key: string): Promise<string | null>;
  /** Reads and deletes in one step: two callers never both get the value. */
  take(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<void>;
  putField(key: string, field: string, value: string, ttlSec: number): Promise<void>;
  fields(key: string): Promise<Record<string, string>>;
  delFields(key: string, fields: string[]): Promise<void>;
}

const P = "v1:";
const wrap = (v: string) => P + v;
const unwrap = (v: unknown) =>
  typeof v === "string" && v.startsWith(P) ? v.slice(P.length) : null;

export function redisKv(redis: Redis): Kv {
  return {
    async set(key, value, ttlSec) {
      await redis.set(key, wrap(value), { ex: ttlSec });
    },
    async get(key) {
      return unwrap(await redis.get(key));
    },
    async take(key) {
      return unwrap(await redis.getdel(key));
    },
    async del(...keys) {
      if (keys.length) await redis.del(...keys);
    },
    async putField(key, field, value, ttlSec) {
      await redis.hset(key, { [field]: wrap(value) });
      await redis.expire(key, ttlSec);
    },
    async fields(key) {
      const raw = (await redis.hgetall<Record<string, unknown>>(key)) ?? {};
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        const s = unwrap(v);
        if (s !== null) out[k] = s;
      }
      return out;
    },
    async delFields(key, fields) {
      if (fields.length) await redis.hdel(key, ...fields);
    },
  };
}

let kv: Kv | null = null;

/** Null when Redis or the encryption key is missing: pairing is then unavailable, nothing else is. */
export function getKv(): Kv | null {
  if (kv) return kv;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || !process.env.REMINDER_ENCRYPTION_KEY) return null;
  kv = redisKv(new Redis({ url, token }));
  return kv;
}
