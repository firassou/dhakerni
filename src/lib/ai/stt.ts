/** Server-side speech-to-text. Default is ElevenLabs Scribe v2; STT_PROVIDER switches it (see docs/decisions.md D5). */
const GEMINI_PROMPT =
  "Transcribe this audio exactly as spoken. Keep every language as spoken: Tunisian Arabic (Derja) in Arabic script, French and English words in Latin script. Do not translate, correct or add anything. Output only the transcript.";

export type SttProvider = "gemini" | "elevenlabs" | "groq";

export interface SttChoice {
  provider?: SttProvider;
  model?: string;
}

export async function transcribeAudio(audio: Blob, choice: SttChoice = {}): Promise<string> {
  const provider =
    choice.provider ?? (process.env.STT_PROVIDER as SttProvider | undefined) ?? "elevenlabs";
  const model = choice.model ?? process.env.STT_MODEL;
  if (provider === "elevenlabs") return scribe(audio, model);
  if (provider === "groq") return groqWhisper(audio, model);
  return gemini(audio, model);
}

async function gemini(audio: Blob, modelOverride?: string): Promise<string> {
  const model = modelOverride ?? "gemini-3.5-transcribe";
  const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: GEMINI_PROMPT },
              { inlineData: { mimeType: audio.type || "audio/webm", data } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini stt ${res.status}`);
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return (j.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

async function scribe(audio: Blob, model?: string): Promise<string> {
  const fd = new FormData();
  fd.append("model_id", model ?? "scribe_v2");
  fd.append("file", audio, "audio");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
    body: fd,
  });
  if (!res.ok) throw new Error(`elevenlabs stt ${res.status}`);
  return (((await res.json()) as { text?: string }).text ?? "").trim();
}

/** Groq's hosted Whisper (OpenAI-compatible endpoint). Language is left on auto-detect so French words stay Latin. */
async function groqWhisper(audio: Blob, model?: string): Promise<string> {
  const fd = new FormData();
  fd.append("model", model ?? "whisper-large-v3");
  fd.append("file", audio, "audio.webm");
  fd.append("temperature", "0");
  fd.append("response_format", "json");
  if (process.env.STT_LANGUAGE) fd.append("language", process.env.STT_LANGUAGE);
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GROQ_API_KEY ?? ""}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`groq stt ${res.status}`);
  return (((await res.json()) as { text?: string }).text ?? "").trim();
}
