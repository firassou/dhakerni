import { generateText, Output } from "ai";
import { parseModel } from "./model";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { ParseResult, type ParseRequest } from "./schema";

export async function parseUtterance(req: ParseRequest): Promise<ParseResult> {
  const { output } = await generateText({
    model: parseModel(),
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(req),
    output: Output.object({ schema: ParseResult }),
    temperature: 0,
  });
  // Output.object already validates; parse again so callers can trust the type and defaults.
  return ParseResult.parse(output);
}
