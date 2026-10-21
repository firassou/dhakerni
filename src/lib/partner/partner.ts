import { getMeta, getSessionId, setMeta } from "../db";
import type { Task } from "../schemas";
import { loadTasks, putTasks } from "../tasks/repo";
import { applyStatus, fromShared, SharedTask, toShared } from "./shared";

/**
 * The client side of partner sharing. Pairing lives in IndexedDB `meta`: the pair token (a secret, never
 * exported with a backup, like the session id) and the name this person calls their partner (kept only
 * here, the server never learns it). Keep the key names in step with public/sw.js.
 */
export const TOKEN_KEY = "pairToken";
export const NAME_KEY = "partnerName";

export interface Pairing {
  token: string;
  name: string;
}

export async function getPairing(): Promise<Pairing | null> {
  const token = await getMeta<string>(TOKEN_KEY);
  if (!token) return null;
  return { token, name: (await getMeta<string>(NAME_KEY)) ?? "" };
}

export async function setPartnerName(name: string) {
  await setMeta(NAME_KEY, name.trim().slice(0, 40));
}

async function clearPairing() {
  const db = await (await import("../db")).getDB();
  await db.delete("meta", TOKEN_KEY);
  await db.delete("meta", NAME_KEY);
}

/** Why a call failed, as a code the screens can word: the server's own code, or "network". */
export class PartnerError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function call<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-session-id": await getSessionId(),
        ...(token ? { "x-pair-token": token } : {}),
      },
    });
  } catch {
    throw new PartnerError("network");
  }
  if (!res.ok) {
    const code = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    // The partner ended the pairing: forget it here too instead of failing forever.
    if (res.status === 401 && code === "not_paired" && token) await clearPairing();
    throw new PartnerError(code ?? `http_${res.status}`);
  }
  return (await res.json()) as T;
}

const authed = async () => {
  const p = await getPairing();
  if (!p) throw new PartnerError("not_paired");
  return p;
};

export const createInvite = () =>
  call<{ code: string; expiresInSec: number }>("/api/pair/create", { method: "POST" });

/** Asks whether the partner used the invitation; when they did, keeps the token and ends the wait. */
export async function checkInvite(): Promise<boolean> {
  const s = await call<{ paired: boolean; token?: string }>("/api/pair/status");
  if (!s.paired || !s.token) return false;
  await setMeta(TOKEN_KEY, s.token);
  return true;
}

export async function joinWithCode(code: string): Promise<void> {
  const { token } = await call<{ token: string }>("/api/pair/join", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  await setMeta(TOKEN_KEY, token);
}

export async function leavePairing(): Promise<void> {
  const p = await getPairing();
  if (p) {
    try {
      await call("/api/pair/leave", { method: "POST" }, p.token);
    } catch (e) {
      // Offline is not "unpaired". Any other answer means the server no longer has this pairing either.
      if (e instanceof PartnerError && e.code === "network") throw e;
    }
  }
  await clearPairing();
}

/** Sends a copy of the task to the partner. Returns the task as it should now be kept here. */
export async function sendTask(task: Task): Promise<Task> {
  const p = await authed();
  const { id } = await call<{ id: string }>(
    "/api/share/send",
    { method: "POST", body: JSON.stringify({ task: toShared(task) }) },
    p.token,
  );
  const sent = {
    ...task,
    assignedTo: "partner" as const,
    // From now on the two copies follow each other's done state.
    share: { id, done: task.done },
    updatedAt: new Date().toISOString(),
  };
  await putTasks([sent]);
  return sent;
}

/** Tells the partner this shared task was finished or reopened. Returns the task with the link brought up to date. */
export async function sendStatus(task: Task): Promise<Task> {
  const p = await authed();
  if (!task.share) return task;
  await call(
    "/api/share/status",
    {
      method: "POST",
      body: JSON.stringify({
        shareId: task.share.id,
        done: task.done,
        title: task.title.slice(0, 80),
      }),
    },
    p.token,
  );
  return { ...task, share: { ...task.share, done: task.done } };
}

export interface Received {
  /** Tasks the partner sent that are new here. */
  fresh: Task[];
  /** Tasks here whose done state the partner changed (finished or reopened). */
  updated: Task[];
}

let draining: Promise<Received> | null = null;

/**
 * Takes what the partner sent (if anything), saves it, and tells the server it can forget it. A task is
 * saved before it is acknowledged, so a crash in between delivers it again, never loses it; the inbox id is
 * the task id, so delivering it twice is still one task. A change of done state is applied to the matching
 * task and also recorded in its link, so it is not sent back.
 */
export function drainInbox(): Promise<Received> {
  draining ??= (async (): Promise<Received> => {
    const none = { fresh: [], updated: [] };
    const p = await getPairing();
    if (!p) return none;
    const { items } = await call<{ items: { id: string; task?: unknown; status?: unknown }[] }>(
      "/api/share/inbox",
      {},
      p.token,
    );
    if (!items.length) return none;
    const existing = await loadTasks();
    const known = new Set(existing.map((t) => t.id));
    const byShare = new Map(existing.filter((t) => t.share).map((t) => [t.share!.id, t]));
    const fresh: Task[] = [];
    const updated: Task[] = [];
    const now = new Date();
    for (const item of items) {
      if (item.status) {
        const { shareId, done } = item.status as { shareId: string; done: boolean };
        const current = updated.find((t) => t.share?.id === shareId) ?? byShare.get(shareId);
        const next = current && applyStatus(current, done === true, now);
        if (next) updated.push(next);
        continue;
      }
      const shared = SharedTask.safeParse(item.task);
      if (!shared.success || known.has(item.id)) continue;
      fresh.push(fromShared(shared.data, item.id, [...existing, ...fresh], now));
    }
    const changed = [...fresh, ...updated];
    if (changed.length) await putTasks(changed);
    await call(
      "/api/share/ack",
      { method: "POST", body: JSON.stringify({ ids: items.map((i) => i.id) }) },
      p.token,
    );
    return { fresh, updated };
  })().finally(() => {
    draining = null;
  });
  return draining;
}

/**
 * Voice: tasks the person said the partner should do carry `assignedTo` before anything is sent. Sends
 * each one; a task that cannot be delivered (not paired, offline) is kept as the person's own, and returned
 * in `failed` so the caller can say so.
 */
export async function deliverAssigned(
  tasks: readonly Task[],
): Promise<{ sent: Task[]; failed: Task[] }> {
  const sent: Task[] = [];
  const failed: Task[] = [];
  for (const task of tasks.filter((t) => t.assignedTo === "partner")) {
    try {
      sent.push(await sendTask(task));
    } catch {
      const own = { ...task, assignedTo: null, updatedAt: new Date().toISOString() };
      await putTasks([own]).catch(() => {});
      failed.push(own);
    }
  }
  return { sent, failed };
}
