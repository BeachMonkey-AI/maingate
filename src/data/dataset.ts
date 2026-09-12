import { readFile } from "node:fs/promises";
import type { OperationalDataset } from "../types.js";

/**
 * Loads the operational dataset once and keeps it in memory. The whole
 * dataset is sent to Gemini with each question, so it has to stay small
 * enough to fit comfortably in a prompt — that's the constraint this PoC
 * accepts in exchange for not hand-coding an action per question.
 */
export function createDatasetLoader(filePath: string): () => Promise<OperationalDataset> {
  let cached: OperationalDataset | null = null;
  return async () => {
    if (!cached) {
      cached = JSON.parse(await readFile(filePath, "utf-8")) as OperationalDataset;
    }
    return cached;
  };
}
