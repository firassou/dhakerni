import { getSessionId } from "../db";
import { markOffline, markOnline } from "../net/online";
import type { BillDraft } from "./bill-schema";
import type { ParseRequest, ParseResult } from "./schema";

export type ApiErrorKind = "rate_limited" | "too_large" | "network" | "server";
export class ApiError extends Error {
  constructor(public kind: ApiErrorKind) {
    super(kind);
  }
}

async function call(path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...init.headers, "x-session-id": await getSessionId() },
    });
  } catch {
    markOffline();
    throw new ApiError("network");
  }
  markOnline(); // the server answered, whatever it answered
  if (res.status === 429) throw new ApiError("rate_limited");
  if (res.status === 413) throw new ApiError("too_large");
  if (!res.ok) throw new ApiError("server");
  return res;
}

export async function transcribe(audio: Blob): Promise<string> {
  const body = new FormData();
  body.append("audio", audio, "speech");
  const res = await call("/api/transcribe", { method: "POST", body });
  return ((await res.json()) as { text: string }).text;
}

export type ParseInput = Omit<ParseRequest, "now" | "timeZone">;

export async function parse(input: ParseInput): Promise<ParseResult> {
  const body: ParseRequest = {
    ...input,
    now: new Date().toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
  const res = await call("/api/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ParseResult;
}

/** A bill photo, PDF or pasted text in; a draft to check out. The file is sent once and never kept. */
export async function readBill(input: { file: Blob } | { text: string }): Promise<BillDraft> {
  const body = new FormData();
  if ("file" in input) body.append("file", input.file, "bill");
  else body.append("text", input.text);
  const res = await call("/api/bill", { method: "POST", body });
  return (await res.json()) as BillDraft;
}
