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

/**
 * Tried in order, falling through on 503 "high demand". Any single model can
 * be congested for long stretches on this API tier, and which one varies:
 * gemini-flash-latest was down while gemini-3.5-flash served fine, then two
 * days later exactly the reverse. Retrying one model doesn't help — the
 * outages outlast any sane backoff — but a different model almost always has
 * capacity, so failing over beats waiting.
 */
const DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.5-flash-lite"];

/**
 * Per-model budget. The SDK retries 503s internally with backoff before
 * surfacing the error — left alone, a single congested model burned 90s,
 * long past the ~30s where Google Chat gives up and shows "not responding".
 * Capping each attempt keeps the whole chain inside that window.
 */
const PER_MODEL_TIMEOUT_MS = 8000;

function isTransient(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  // Timeouts and aborts count: hitting PER_MODEL_TIMEOUT_MS is the normal way
  // a congested model surfaces here, and it must fall through like a 503.
  return /\[(429|500|502|503|504)\s/.test(message) || /timeout|aborted|abort/i.test(message);
}

export class GeminiAnswerer implements Answerer {
  private readonly models: { name: string; model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> }[];
  private preferredIndex = 0;

  constructor(apiKey: string, modelNames: string[] = DEFAULT_MODELS) {
    const client = new GoogleGenerativeAI(apiKey);
    this.models = modelNames.map((name) => ({
      name,
      model: client.getGenerativeModel(
        { model: name, systemInstruction: SYSTEM_INSTRUCTION },
        { timeout: PER_MODEL_TIMEOUT_MS },
      ),
    }));
  }

  async answer(question: string, dataset: OperationalDataset): Promise<string> {
    const prompt = `DATA:\n${JSON.stringify(dataset)}\n\nQUESTION: ${question}`;
    let lastError: unknown;

    // Start from whichever model last worked. Congestion lasts hours, so a
    // fixed order means paying the timeout on every question for the whole
    // outage — 8s per dead model, on every single request.
    for (let i = 0; i < this.models.length; i++) {
      const index = (this.preferredIndex + i) % this.models.length;
      const { name, model } = this.models[index];
      try {
        const result = await model.generateContent(prompt);
        this.preferredIndex = index;
        return result.response.text().trim();
      } catch (err) {
        if (!isTransient(err)) {
          throw err;
        }
        lastError = err;
        // eslint-disable-next-line no-console
        console.warn(`${name} unavailable, falling through to next model:`, err instanceof Error ? err.message : err);
      }
    }

    throw lastError;
  }
}
