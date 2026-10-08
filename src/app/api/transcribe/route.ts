import { transcribeAudio } from "@/lib/ai/stt";
import { enforce } from "@/lib/server/rate-limit";

export const maxDuration = 60;
const MAX_BYTES = 4 * 1024 * 1024; // Vercel request bodies top out at 4.5 MB

export async function POST(req: Request) {
  const limited = await enforce(req, "transcribe", [
    { name: "min", max: 20, windowSec: 60 },
    { name: "day", max: 400, windowSec: 86_400 },
  ]);
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });

  try {
    // Provider overrides exist only for the dev comparison page (/dev/stt).
    const dev = process.env.NODE_ENV !== "production";
    const provider = dev ? new URL(req.url).searchParams.get("provider") : null;
    const model = dev ? new URL(req.url).searchParams.get("model") : null;
    const text = await transcribeAudio(audio, {
      provider:
        provider === "elevenlabs" || provider === "gemini" || provider === "groq"
          ? provider
          : undefined,
      model: model ?? undefined,
    });
    return Response.json({ text });
  } catch (e) {
    console.error("transcribe failed", e);
    return Response.json({ error: "transcribe_failed" }, { status: 502 });
  }
}
