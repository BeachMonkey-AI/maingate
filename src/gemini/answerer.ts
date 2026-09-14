import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration } from "@google/generative-ai";
import type { OperationalDataset } from "../types.js";
import type { Turn } from "../chat/conversation.js";
import type { UpdateKeyBoxCodeRequest } from "../actions/updateKeyBoxCode.js";

export interface AnswerRequest {
  question: string;
  dataset: OperationalDataset;
  history: Turn[];
}

/** Either a reply to send, or a validated write for the caller to apply. */
export type AnswerOutcome =
  | { kind: "reply"; text: string }
  | { kind: "updateKeyBoxCode"; request: UpdateKeyBoxCodeRequest };

export interface Answerer {
  answer(request: AnswerRequest): Promise<AnswerOutcome>;
}

const SYSTEM_INSTRUCTION = [
  "You answer questions about MainGate's operational property-management data,",
  "and you can change lockbox codes.",
  "Answer using ONLY the JSON provided in the message. Never invent properties,",
  "work orders, vendors, people, or numbers that aren't in it. If the data",
  "doesn't contain the answer, say so plainly.",
  "",
  "CHANGING A CODE: call updateKeyBoxCode. Lockbox codes are the only thing you",
  "can change — for any other edit, say that you can only update lockbox codes.",
  "Before calling it you must be certain of three things: which property, which",
  "specific box, and whether this replaces an existing code or adds a new box.",
  "If a property has more than one box and the user hasn't said which, ask —",
  "do not guess. If it is a replacement, pass the exact existing text being",
  "superseded, copied character for character from the notes, as 'supersedes'.",
  "Before proposing the change, ask whether there are any notes to record,",
  "unless the user has already given some — the notes are part of what gets",
  "written, so collect them first.",
  "Calling the function does not change anything by itself: it proposes the",
  "change, and the user is then shown the exact before and after and asked to",
  "confirm. So once you have the box and any notes, call it — do not ask for",
  "confirmation yourself, and do not state the date or who made the change.",
  "Those are handled for you.",
  "",
  "Replies are shown in a Google Chat message. Keep them short and",
  "conversational, and list items one per line when there are several.",
  "Write plain text only — no markdown. Chat does not render it, so **bold**,",
  "headings, bullet characters and tables all show up as literal punctuation.",
].join(" ");

const UPDATE_KEY_BOX_CODE: FunctionDeclaration = {
  name: "updateKeyBoxCode",
  description:
    "Record a new or changed lockbox code for a property. Only call this once the property, " +
    "the specific box, and whether it replaces an existing code are all unambiguous.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      propertyId: { type: SchemaType.NUMBER, description: "Numeric propertyId from the data." },
      location: {
        type: SchemaType.STRING,
        description: "Short label for which box this is, e.g. 'pool gate', 'front office'.",
      },
      code: { type: SchemaType.STRING, description: "The new code." },
      mode: {
        type: SchemaType.STRING,
        format: "enum",
        enum: ["replace", "add"],
        description: "'replace' if this supersedes an existing code, 'add' for a box not recorded yet.",
      },
      supersedes: {
        type: SchemaType.STRING,
        description:
          "Required when mode is 'replace'. The exact existing text being superseded, copied " +
          "verbatim from the property's current notes.",
      },
      notes: { type: SchemaType.STRING, description: "Any extra notes the user gave, verbatim." },
    },
    required: ["propertyId", "location", "code", "mode"],
  },
};

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
        {
          model: name,
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: [UPDATE_KEY_BOX_CODE] }],
        },
        { timeout: PER_MODEL_TIMEOUT_MS },
      ),
    }));
  }

  async answer({ question, dataset, history }: AnswerRequest): Promise<AnswerOutcome> {
    const prompt = `DATA:\n${JSON.stringify(dataset)}\n\nQUESTION: ${question}`;
    const priorTurns = history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }));
    let lastError: unknown;

    // Start from whichever model last worked. Congestion lasts hours, so a
    // fixed order means paying the timeout on every question for the whole
    // outage — 8s per dead model, on every single request.
    for (let i = 0; i < this.models.length; i++) {
      const index = (this.preferredIndex + i) % this.models.length;
      const { name, model } = this.models[index];
      try {
        const result = await model.generateContent({
          contents: [...priorTurns, { role: "user", parts: [{ text: prompt }] }],
        });
        this.preferredIndex = index;

        const call = result.response.functionCalls()?.[0];
        if (call?.name === UPDATE_KEY_BOX_CODE.name) {
          return { kind: "updateKeyBoxCode", request: call.args as UpdateKeyBoxCodeRequest };
        }
        return { kind: "reply", text: result.response.text().trim() };
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
