import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { SharedTask } from "../partner/shared";
import { decrypt, encrypt } from "./crypto";
import type { Kv } from "./kv";

/**
 * Two devices become partners with a short single-use code. There are no accounts: the code proves the
 * second person was handed the first one's invitation, and each device then gets a long random pair token
 * (the server keeps only its hash). Sharing relies on that token, never on the self-chosen session id.
 *
 * What the server holds: who is paired with whom, the hash of each token, and an inbox of tasks that were
 * sent and not yet taken. Every stored value is encrypted; an inbox item is deleted when the partner's
 * device acknowledges it, and expires on its own after INBOX_TTL.
 */

export const INVITE_TTL_SEC = 10 * 60;
export const INBOX_TTL_SEC = 14 * 86_400;
export const MAX_INBOX = 50;
/** How long the person who made the invitation has to collect their token after the partner joined. */
const PENDING_TOKEN_TTL_SEC = 7 * 86_400;
const PAIR_TTL_SEC = 3650 * 86_400;

// No 0/O/1/I/L: the code is read aloud and typed by hand.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

const kInvite = (code: string) => `inv:${code}`;
const kPartner = (sid: string) => `partner:${sid}`;
const kTokenHash = (sid: string) => `ptok:${sid}`;
const kPending = (sid: string) => `ptok-new:${sid}`;
const kInbox = (sid: string) => `inbox:${sid}`;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

export function newCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** What a person typed or pasted, as the code it stands for: any case, spaces and dashes ignored. */
export function normalizeCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}

export type PairError =
  "already_paired" | "invalid_code" | "own_code" | "not_paired" | "inbox_full";

export async function createInvite(
  kv: Kv,
  sid: string,
): Promise<{ code: string; expiresInSec: number } | { error: PairError }> {
  if (await kv.get(kPartner(sid))) return { error: "already_paired" };
  const code = newCode();
  await kv.set(kInvite(code), encrypt(sid), INVITE_TTL_SEC);
  return { code, expiresInSec: INVITE_TTL_SEC };
}

export async function joinInvite(
  kv: Kv,
  sid: string,
  rawCode: string,
): Promise<{ token: string } | { error: PairError }> {
  const code = normalizeCode(rawCode);
  if (!code) return { error: "invalid_code" };
  if (await kv.get(kPartner(sid))) return { error: "already_paired" };
  // Single use: whoever takes it first gets it, a second try finds nothing.
  const enc = await kv.take(kInvite(code));
  if (!enc) return { error: "invalid_code" };
  let creator: string;
  try {
    creator = decrypt(enc);
  } catch {
    return { error: "invalid_code" };
  }
  if (creator === sid) return { error: "own_code" };
  if (await kv.get(kPartner(creator))) return { error: "invalid_code" };

  const mine = newToken();
  const theirs = newToken();
  await Promise.all([
    kv.set(kPartner(sid), encrypt(creator), PAIR_TTL_SEC),
    kv.set(kPartner(creator), encrypt(sid), PAIR_TTL_SEC),
    kv.set(kTokenHash(sid), hash(mine), PAIR_TTL_SEC),
    kv.set(kTokenHash(creator), hash(theirs), PAIR_TTL_SEC),
    kv.set(kPending(creator), encrypt(theirs), PENDING_TOKEN_TTL_SEC),
  ]);
  return { token: mine };
}

/**
 * For the device that made the invitation: has the partner joined yet? The token is handed over until that
 * device uses it once (see `verify`), so a response lost on the way does not lose the pairing.
 */
export async function status(kv: Kv, sid: string): Promise<{ paired: boolean; token?: string }> {
  if (!(await kv.get(kPartner(sid)))) return { paired: false };
  const pending = await kv.get(kPending(sid));
  if (!pending) return { paired: true };
  try {
    return { paired: true, token: decrypt(pending) };
  } catch {
    return { paired: true };
  }
}

/** The partner's session id when `token` is this device's pair token, else null. */
export async function verify(kv: Kv, sid: string, token: string): Promise<string | null> {
  if (!token || token.length > 128) return null;
  const [stored, partner] = await Promise.all([kv.get(kTokenHash(sid)), kv.get(kPartner(sid))]);
  if (!stored || !partner) return null;
  const a = Buffer.from(stored);
  const b = Buffer.from(hash(token));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  await kv.del(kPending(sid)); // the token works, so this device has it
  try {
    return decrypt(partner);
  } catch {
    return null;
  }
}

/** Ends the pairing for both sides and throws away anything still waiting in either inbox. */
export async function leave(kv: Kv, sid: string, partnerSid: string): Promise<void> {
  await kv.del(
    ...[sid, partnerSid].flatMap((s) => [kPartner(s), kTokenHash(s), kPending(s), kInbox(s)]),
  );
}

export async function send(
  kv: Kv,
  partnerSid: string,
  task: SharedTask,
  now: Date,
): Promise<{ id: string } | { error: PairError }> {
  const waiting = Object.keys(await kv.fields(kInbox(partnerSid))).length;
  if (waiting >= MAX_INBOX) return { error: "inbox_full" };
  const id = randomUUID();
  await kv.putField(
    kInbox(partnerSid),
    id,
    encrypt(JSON.stringify({ id, sentAt: now.toISOString(), task })),
    INBOX_TTL_SEC,
  );
  return { id };
}

/**
 * Tells the partner a shared task was finished or reopened. One entry per task (a newer change replaces
 * an older one that was not taken yet), so a flurry of toggles is a single message.
 */
export async function sendStatus(
  kv: Kv,
  partnerSid: string,
  shareId: string,
  done: boolean,
  now: Date,
): Promise<void> {
  const id = `st-${shareId}`;
  await kv.putField(
    kInbox(partnerSid),
    id,
    encrypt(JSON.stringify({ id, sentAt: now.toISOString(), status: { shareId, done } })),
    INBOX_TTL_SEC,
  );
}

export interface InboxItem {
  id: string;
  sentAt: string;
  task?: SharedTask;
  status?: { shareId: string; done: boolean };
}

/** Everything waiting for this device, oldest first. Items that cannot be read are dropped, not kept forever. */
export async function inbox(kv: Kv, sid: string): Promise<InboxItem[]> {
  const raw = await kv.fields(kInbox(sid));
  const items: InboxItem[] = [];
  const broken: string[] = [];
  for (const [id, enc] of Object.entries(raw)) {
    try {
      const v = JSON.parse(decrypt(enc)) as InboxItem;
      if (v.status) {
        items.push({
          id,
          sentAt: v.sentAt,
          status: { shareId: String(v.status.shareId), done: v.status.done === true },
        });
      } else items.push({ id, sentAt: v.sentAt, task: SharedTask.parse(v.task) });
    } catch {
      broken.push(id);
    }
  }
  if (broken.length) await kv.delFields(kInbox(sid), broken);
  return items.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

export async function ack(kv: Kv, sid: string, ids: string[]): Promise<void> {
  await kv.delFields(kInbox(sid), ids);
}
