import { extractBill, type BillSource } from "@/lib/ai/bill";
import { toDraft } from "@/lib/bills/normalize";
import { enforce } from "@/lib/server/rate-limit";

export const maxDuration = 60;
const MAX_BYTES = 4 * 1024 * 1024; // Vercel request bodies top out at 4.5 MB
const MAX_TEXT = 4000;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/**
 * Reads a bill from a photo, a PDF or pasted text and answers with a draft to check. Nothing is stored:
 * the file lives in this request only.
 */
export async function POST(req: Request) {
  const limited = await enforce(req, "bill", [
    { name: "min", max: 6, windowSec: 60 },
    { name: "day", max: 60, windowSec: 86_400 },
  ]);
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const text = form?.get("text");

  let source: BillSource;
  if (file instanceof Blob && file.size > 0) {
    if (file.size > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
    if (!TYPES.has(file.type)) return Response.json({ error: "bad_request" }, { status: 400 });
    source = {
      kind: "file",
      bytes: new Uint8Array(await file.arrayBuffer()),
      mediaType: file.type,
    };
  } else if (typeof text === "string" && text.trim()) {
    source = { kind: "text", text: text.trim().slice(0, MAX_TEXT) };
  } else {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const now = new Date();
    return Response.json(toDraft(await extractBill(source, now), now));
  } catch (e) {
    console.error("bill failed", e);
    return Response.json({ error: "bill_failed" }, { status: 502 });
  }
}
