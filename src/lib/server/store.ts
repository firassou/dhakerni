import { Redis } from "@upstash/redis";
import { redisStore } from "./redis-store";
import type { ReminderStore } from "./reminders";

let store: ReminderStore | null = null;

/** Null when Redis is not configured: reminders then work only while the app is open. */
export function getStore(): ReminderStore | null {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  store = redisStore(new Redis({ url, token }));
  return store;
}
