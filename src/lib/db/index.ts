import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ProfileFact, Task } from "../schemas";

interface DhakerniDB extends DBSchema {
  tasks: {
    key: string;
    value: Task;
    indexes: { "by-order": number; "by-due": string };
  };
  profile: {
    key: string;
    value: ProfileFact;
    indexes: { "by-key": string };
  };
  /** Small key/value store: settings, anonymous session id, schema info. */
  meta: { key: string; value: unknown };
}

export const DB_NAME = "dhakerni";
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<DhakerniDB>> | null = null;

export function getDB() {
  dbPromise ??= openDB<DhakerniDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const tasks = db.createObjectStore("tasks", { keyPath: "id" });
      tasks.createIndex("by-order", "order");
      tasks.createIndex("by-due", "dueAt");
      const profile = db.createObjectStore("profile", { keyPath: "id" });
      profile.createIndex("by-key", "key", { unique: true });
      db.createObjectStore("meta");
    },
  });
  return dbPromise;
}

/** Test helper: forget the cached connection. */
export async function resetDBForTests() {
  (await dbPromise)?.close();
  dbPromise = null;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await getDB()).get("meta", key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown) {
  await (await getDB()).put("meta", value, key);
}

/** Anonymous device id, created on first launch. No account, no email. */
export async function getSessionId(): Promise<string> {
  const existing = await getMeta<string>("sessionId");
  if (existing) return existing;
  const id = crypto.randomUUID();
  await setMeta("sessionId", id);
  return id;
}
