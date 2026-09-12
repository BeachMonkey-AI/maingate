import { GoogleGenerativeAI } from "@google/generative-ai";
import type { OperationalDataset } from "../types.js";

export interface Answerer {
  answer(question: string, dataset: OperationalDataset): Promise<string>;
}

const SYSTEM_INSTRUCTION = [
  "You answer questions about MainGate's operational property-management data.",
  "Answer using ONLY the JSON provided in the message. Never invent properties,",
  "work orders, vendors, people, or numbers that aren't in it. If the data",
  "doesn't contain the answer, say so plainly.",
  "Replies are shown in a Google Chat message. Keep them short and",
  "conversational, and list items one per line when there are several.",
  "Write plain text only — no markdown. Chat does not render it, so **bold**,",
  "headings, bullet characters and tables all show up as literal punctuation.",
].join(" ");

const RETRY_DELAYS_MS = [500, 1500];

/**
 * Pinned rather than using a `-latest` alias: the alias tracks the newest
 * model, which is also the most contended, and returned sustained 503s
 * ("experiencing high demand") while pinned models served fine.
 */
const DEFAULT_MODEL = "gemini-3.5-flash";

function isTransient(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\[(429|500|502|503|504)\s/.test(message);
}

export class GeminiAnswerer implements Answerer {
  private readonly model;

  constructor(apiKey: string, modelName = DEFAULT_MODEL) {
    const client = new GoogleGenerativeAI(apiKey);
    this.model = client.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_INSTRUCTION,
    });
  }

  async answer(question: string, dataset: OperationalDataset): Promise<string> {
    const prompt = `DATA:\n${JSON.stringify(dataset)}\n\nQUESTION: ${question}`;

    for (let attempt = 0; ; attempt++) {
      try {
        const result = await this.model.generateContent(prompt);
        return result.response.text().trim();
      } catch (err) {
        if (attempt >= RETRY_DELAYS_MS.length || !isTransient(err)) {
          throw err;
        }
        // eslint-disable-next-line no-console
        console.warn(`Gemini call failed (attempt ${attempt + 1}), retrying:`, err);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
}
