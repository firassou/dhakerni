import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";

/**
 * Parser model. PARSE_PROVIDER=google|groq, PARSE_MODEL overrides the default for that provider.
 * Ids come from env so they can change without code changes.
 */
export function parseModel() {
  const provider = process.env.PARSE_PROVIDER ?? "google";
  if (provider === "groq") return groq(process.env.PARSE_MODEL ?? "openai/gpt-oss-120b");
  return google(process.env.PARSE_MODEL ?? "gemini-3.5-flash-lite");
}

export const parseModelLabel = () =>
  `${process.env.PARSE_PROVIDER ?? "google"}:${process.env.PARSE_MODEL ?? (process.env.PARSE_PROVIDER === "groq" ? "openai/gpt-oss-120b" : "gemini-3.5-flash-lite")}`;
