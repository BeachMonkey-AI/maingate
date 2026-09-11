import type { Intent } from "../types.js";

export interface IntentParser {
  /** Returns null when no supported intent could be extracted from the text. */
  parse(text: string): Promise<Intent | null>;
}
