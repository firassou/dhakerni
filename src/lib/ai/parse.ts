import { generateText, Output } from "ai";
import { parseModels } from "./model";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { ParseResult, type ParseRequest } from "./schema";

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
