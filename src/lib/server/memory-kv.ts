import type { Kv } from "./kv";

/** An in-process Kv with the same semantics as the Redis one (atomic take). For tests; never used by the app. */
export function memoryKv() {
  const kv = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const api: Kv = {
    async set(k, v) {
      kv.set(k, v);
    },
    async get(k) {
      return kv.get(k) ?? null;
    },
    async take(k) {
      const v = kv.get(k) ?? null;
      kv.delete(k);
      return v;
    },
    async del(...keys) {
      for (const k of keys) {
        kv.delete(k);
        hashes.delete(k);
      }
    },
    async putField(k, f, v) {
      (hashes.get(k) ?? hashes.set(k, new Map()).get(k)!).set(f, v);
    },
    async fields(k) {
      return Object.fromEntries(hashes.get(k) ?? []);
    },
    async delFields(k, fs) {
      for (const f of fs) hashes.get(k)?.delete(f);
    },
  };
  return { api, kv, hashes };
}
