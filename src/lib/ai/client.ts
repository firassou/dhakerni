import { getSessionId } from "../db";
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
    throw new ApiError("network");
  }
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
