import { parseUtterance } from "@/lib/ai/parse";
import { ParseRequest } from "@/lib/ai/schema";
import { enforce } from "@/lib/server/rate-limit";

export const maxDuration = 60;

export async function POST(req: Request) {
  const limited = await enforce(req, "parse", [
    { name: "min", max: 20, windowSec: 60 },
    { name: "day", max: 400, windowSec: 86_400 },
  ]);
  if (limited) return limited;

  const body = ParseRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "bad_request" }, { status: 400 });

  try {
    return Response.json(await parseUtterance(body.data));
  } catch (e) {
    console.error("parse failed", e);
    return Response.json({ error: "parse_failed" }, { status: 502 });
  }
}
