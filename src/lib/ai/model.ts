import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

const DEFAULTS = { google: "gemini-3.5-flash-lite", groq: "openai/gpt-oss-120b" } as const;
type Provider = keyof typeof DEFAULTS;

const hasKey = (p: Provider) =>
  p === "google" ? !!process.env.GOOGLE_GENERATIVE_AI_API_KEY : !!process.env.GROQ_API_KEY;

function build(p: Provider): { label: string; model: LanguageModel } {
  const id = (
    process.env.PARSE_MODEL && p === primary() ? process.env.PARSE_MODEL : DEFAULTS[p]
  ) as string;
  return { label: `${p}:${id}`, model: p === "groq" ? groq(id) : google(id) };
}

const primary = (): Provider => (process.env.PARSE_PROVIDER === "groq" ? "groq" : "google");

/**
 * Parser models in the order to try them. PARSE_PROVIDER picks the primary; the other provider is
 * the fallback when its key is set, because each free tier runs out in a different way.
 */
export function parseModels() {
  const first = primary();
  const second: Provider = first === "google" ? "groq" : "google";
  return [first, ...(hasKey(second) ? [second] : [])].map(build);
}

export const parseModelLabel = () => parseModels()[0].label;

/**
 * The model that reads a bill photo or PDF. Only Gemini here: the fallback parser model cannot see
 * images. Text pasted from an SMS can still go through `parseModels()`.
 */
export function visionModel(): { label: string; model: LanguageModel } | null {
  if (!hasKey("google")) return null;
  const id = process.env.BILL_MODEL ?? DEFAULTS.google;
  return { label: `google:${id}`, model: google(id) };
}
