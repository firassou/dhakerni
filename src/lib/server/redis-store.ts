import { Redis } from "@upstash/redis";
import type { ReminderStore } from "./reminders";

const DUE = "due";
const member = (sid: string, taskId: string) => `${sid}:${taskId}`;
const rKey = (sid: string, taskId: string) => `r:${sid}:${taskId}`;

export function redisStore(redis: Redis): ReminderStore {
  return {
    async putSub(sid, enc, ttl) {
      await redis.set(`sub:${sid}`, enc, { ex: ttl });
    },
    async getSub(sid) {
      return (await redis.get<string>(`sub:${sid}`)) ?? null;
    },
    async delSub(sid) {
      await redis.del(`sub:${sid}`);
    },
    async putReminder(sid, taskId, enc, fireAtMs, ttl) {
      await Promise.all([
        redis.set(rKey(sid, taskId), enc, { ex: ttl }),
        redis.zadd(DUE, { score: fireAtMs, member: member(sid, taskId) }),
        redis.sadd(`ids:${sid}`, taskId),
        redis.expire(`ids:${sid}`, ttl),
      ]);
    },
    async getReminder(sid, taskId) {
      return (await redis.get<string>(rKey(sid, taskId))) ?? null;
    },
    async listTaskIds(sid) {
      return redis.smembers(`ids:${sid}`);
    },
    async delReminder(sid, taskId) {
      await Promise.all([
        redis.del(rKey(sid, taskId)),
        redis.zrem(DUE, member(sid, taskId)),
        redis.srem(`ids:${sid}`, taskId),
      ]);
    },
    async claimDue(nowMs, limit) {
      const due = await redis.zrange<string[]>(DUE, 0, nowMs, {
        byScore: true,
        offset: 0,
        count: limit,
      });
      const claimed: { sid: string; taskId: string }[] = [];
      for (const m of due) {
        // zrem returns 1 only for the caller that removed it, so a member is never sent twice.
        if ((await redis.zrem(DUE, m)) === 1) {
          const i = m.indexOf(":");
          claimed.push({ sid: m.slice(0, i), taskId: m.slice(i + 1) });
        }
      }
      return claimed;
    },
    async dueTimes(fromMs, toMs, limit) {
      const rows = await redis.zrange<(string | number)[]>(DUE, fromMs, toMs, {
        byScore: true,
        offset: 0,
        count: limit,
        withScores: true,
      });
      const times: number[] = [];
      for (let i = 1; i < rows.length; i += 2) times.push(Number(rows[i]));
      return times;
    },
    async markOnce(key, ttl) {
      return (await redis.set(key, 1, { nx: true, ex: ttl })) === "OK";
    },
    async unmark(key) {
      await redis.del(key);
    },
    async beat(nowMs) {
      await redis.set("cron:last", nowMs);
    },
    async lastBeat() {
      const v = await redis.get<number | string>("cron:last");
      return v === null ? null : Number(v);
    },
  };
}
