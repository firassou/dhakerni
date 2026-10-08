// Generates synthetic speech clips with Gemini TTS. Bare text only: any instruction text gets read aloud. Synthetic audio is cleaner and less accented than
// real Derja speech, so treat results as a rough signal only.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const utts = JSON.parse(readFileSync(new URL("./utterances.json", import.meta.url)));
mkdirSync("scripts/stt-bench/clips", { recursive: true });

function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
const have = (id) => {
  try {
    readFileSync(`scripts/stt-bench/clips/${id}.wav`);
    return true;
  } catch {
    return false;
  }
};
for (const u of utts) {
  if (have(u.id)) continue;
  let res, j;
  for (let attempt = 0; attempt < 6; attempt++) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: u.text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
          },
        }),
      },
    );
    j = await res.json();
    if (res.status !== 429) break;
    console.log(u.id, "rate limited, waiting 25s");
    await new Promise((r) => setTimeout(r, 25000));
  }
  const b64 = j.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) {
    console.log(u.id, "FAILED", JSON.stringify(j).slice(0, 200));
    continue;
  }
  writeFileSync(`scripts/stt-bench/clips/${u.id}.wav`, wav(Buffer.from(b64, "base64")));
  console.log(u.id, "ok");
}
