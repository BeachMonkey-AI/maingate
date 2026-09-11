import { GeminiIntentParser } from "./geminiIntentParser.js";
import type { IntentParser } from "./parser.js";
import { RuleBasedIntentParser } from "./ruleBasedIntentParser.js";

export type { IntentParser } from "./parser.js";
export { RuleBasedIntentParser } from "./ruleBasedIntentParser.js";
export { GeminiIntentParser } from "./geminiIntentParser.js";

/** Uses Gemini when GEMINI_API_KEY is set, otherwise the deterministic fallback. */
export function createIntentParser(env: NodeJS.ProcessEnv = process.env): IntentParser {
  const apiKey = env.GEMINI_API_KEY;
  if (apiKey) {
    return new GeminiIntentParser(apiKey, env.GEMINI_MODEL);
  }
  return new RuleBasedIntentParser();
}
