import { beforeAll, describe, expect, it } from "vitest";
import { memoryKv } from "./memory-kv";
import {
  ack,
  createInvite,
  inbox,
  joinInvite,
  leave,
  MAX_INBOX,
  newCode,
  normalizeCode,
  send,
  sendStatus,
  status,
  verify,
} from "./pairing";
import { SharedTask } from "../partner/shared";

beforeAll(() => {
  process.env.REMINDER_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
});

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const task = (title = "Buy bread") => SharedTask.parse({ title });
const now = new Date("2026-10-21T10:00:00Z");

async function paired() {
  const m = memoryKv();
  const invite = await createInvite(m.api, A);
  if ("error" in invite) throw new Error(invite.error);
  const joined = await joinInvite(m.api, B, invite.code);
  if ("error" in joined) throw new Error(joined.error);
  const st = await status(m.api, A);
  return { ...m, tokenA: st.token!, tokenB: joined.token };
}

describe("codes", () => {
  it("are 8 characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
  });
  it("accept any case, spaces and dashes; reject the wrong shape", () => {
    expect(normalizeCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(normalizeCode("ABC")).toBeNull();
    expect(normalizeCode("ABCD0O1I")).toBeNull();
  });
});

describe("pairing", () => {
  it("gives each device its own token and links them both ways", async () => {
    const { api, tokenA, tokenB } = await paired();
    expect(tokenA).not.toBe(tokenB);
    expect(await verify(api, A, tokenA)).toBe(B);
    expect(await verify(api, B, tokenB)).toBe(A);
  });

  it("rejects a wrong token, another device's token, and an empty one", async () => {
    const { api, tokenA, tokenB } = await paired();
    expect(await verify(api, A, "nope")).toBeNull();
    expect(await verify(api, A, tokenB)).toBeNull();
    expect(await verify(api, A, "")).toBeNull();
    expect(await verify(api, "33333333-3333-4333-8333-333333333333", tokenA)).toBeNull();
  });

  it("uses a code once", async () => {
    const m = memoryKv();
    const invite = (await createInvite(m.api, A)) as { code: string };
    expect(await joinInvite(m.api, B, invite.code)).toHaveProperty("token");
    const C = "44444444-4444-4444-8444-444444444444";
    expect(await joinInvite(m.api, C, invite.code)).toEqual({ error: "invalid_code" });
  });

  it("refuses your own code, an unknown code, and pairing twice", async () => {
    const m = memoryKv();
    const invite = (await createInvite(m.api, A)) as { code: string };
    expect(await joinInvite(m.api, A, invite.code)).toEqual({ error: "own_code" });
    expect(await joinInvite(m.api, B, "ZZZZZZZZ")).toEqual({ error: "invalid_code" });
    const again = (await createInvite(m.api, A)) as { code: string };
    await joinInvite(m.api, B, again.code);
    expect(await createInvite(m.api, A)).toEqual({ error: "already_paired" });
    expect(await createInvite(m.api, B)).toEqual({ error: "already_paired" });
  });

  it("hands the inviter their token until they use it once", async () => {
    const m = memoryKv();
    expect(await status(m.api, A)).toEqual({ paired: false });
    const invite = (await createInvite(m.api, A)) as { code: string };
    expect(await status(m.api, A)).toEqual({ paired: false });
    await joinInvite(m.api, B, invite.code);
    const first = await status(m.api, A);
    expect(first.token).toBeTruthy();
    expect((await status(m.api, A)).token).toBe(first.token); // a lost response is not a lost pairing
    await verify(m.api, A, first.token!);
    expect(await status(m.api, A)).toEqual({ paired: true });
  });

  it("stores no token or session id in the clear", async () => {
    const { kv, tokenA, tokenB } = await paired();
    const all = [...kv.values()].join("|");
    expect(all).not.toContain(tokenA);
    expect(all).not.toContain(tokenB);
    expect(all).not.toContain(A);
    expect(all).not.toContain(B);
  });

  it("leaving unpairs both sides and empties both inboxes", async () => {
    const { api, tokenA, tokenB } = await paired();
    await send(api, B, task(), now);
    await leave(api, A, B);
    expect(await verify(api, A, tokenA)).toBeNull();
    expect(await verify(api, B, tokenB)).toBeNull();
    expect(await inbox(api, B)).toEqual([]);
    expect(await createInvite(api, A)).toHaveProperty("code");
  });
});

describe("inbox", () => {
  it("delivers what was sent, oldest first, and deletes it on ack", async () => {
    const { api } = await paired();
    await send(api, B, task("first"), new Date("2026-10-21T10:00:00Z"));
    await send(api, B, task("second"), new Date("2026-10-21T10:05:00Z"));
    const items = await inbox(api, B);
    expect(items.map((i) => i.task!.title)).toEqual(["first", "second"]);
    expect(await inbox(api, A)).toEqual([]); // the sender's own inbox is untouched
    await ack(api, B, [items[0].id]);
    expect((await inbox(api, B)).map((i) => i.task!.title)).toEqual(["second"]);
    await ack(api, B, [items[1].id]);
    expect(await inbox(api, B)).toEqual([]);
  });

  it("keeps the task text encrypted at rest", async () => {
    const { api, hashes } = await paired();
    await send(api, B, task("secret title"), now);
    const stored = [...(hashes.get(`inbox:${B}`) ?? new Map()).values()].join("");
    expect(stored).not.toContain("secret");
  });

  it("drops an item it cannot read instead of keeping it forever", async () => {
    const { api, hashes } = await paired();
    await api.putField(`inbox:${B}`, "bad", "not-encrypted", 100);
    expect(await inbox(api, B)).toEqual([]);
    expect(hashes.get(`inbox:${B}`)?.has("bad")).toBe(false);
  });

  it("refuses to pile up more than the limit", async () => {
    const { api } = await paired();
    for (let i = 0; i < MAX_INBOX; i++) await send(api, B, task(`t${i}`), now);
    expect(await send(api, B, task("one too many"), now)).toEqual({ error: "inbox_full" });
  });

  it("a finished-state note is one entry per task: the newest replaces the older", async () => {
    const { api } = await paired();
    await sendStatus(api, B, "share-1", true, now);
    await sendStatus(api, B, "share-1", false, new Date("2026-10-21T10:01:00Z"));
    await sendStatus(api, B, "share-2", true, now);
    const items = await inbox(api, B);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.status?.shareId === "share-1")?.status).toEqual({
      shareId: "share-1",
      done: false,
    });
    expect(items.every((i) => i.task === undefined)).toBe(true);
    await ack(
      api,
      B,
      items.map((i) => i.id),
    );
    expect(await inbox(api, B)).toEqual([]);
  });
});
