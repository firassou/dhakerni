import { generateText, Output } from "ai";
import { parseModels } from "./model";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { ParseResult, type ParseRequest } from "./schema";

const MAX_OUTPUT_TOKENS = 8192;

/** Tries each configured model in order; throws the last error if all fail. */
export async function parseUtterance(req: ParseRequest): Promise<ParseResult> {
  let lastError: unknown;
  for (const { label, model } of parseModels()) {
    try {
      const { output } = await generateText({
        model,
        system: SYSTEM_PROMPT,
        prompt: buildUserPrompt(req),
        output: Output.object({ schema: ParseResult }),
        temperature: 0,
        maxRetries: 1,
        // A long, many-task message makes a long answer. Left at the provider's default, the answer was
        // cut off half-way, failed validation, and the whole message was saved as one plain task.
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // The fallback model thinks before answering, and that thinking counts against the same limit.
        providerOptions: { groq: { reasoningEffort: "low" } },
      });
      // Output.object validates already; parse again so callers can trust the type and defaults.
      return ParseResult.parse(output);
    } catch (e) {
      console.error(`parse failed on ${label}`, e instanceof Error ? e.message.slice(0, 200) : e);
      lastError = e;
    }
  }
  throw lastError;
}
