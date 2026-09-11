import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration } from "@google/generative-ai";
import type { Intent } from "../types.js";
import type { IntentParser } from "./parser.js";

/**
 * Maps user text to one of the Phase 1 read-only actions using Gemini
 * function calling. Gemini only ever *proposes* a function name + args;
 * executeIntent (src/actions/registry.ts) is the sole place anything is
 * looked up, and it re-validates against the allowlist regardless of what
 * comes back here. This is the "Gemini never writes directly to storage"
 * boundary from the PRD, enforced independent of prompt behavior.
 */
const FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "getProperty",
    description: "Look up a property by its numeric property ID.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { propertyId: { type: SchemaType.NUMBER } },
      required: ["propertyId"],
    },
  },
  {
    name: "findPropertyByName",
    description: "Look up a property by name (exact or partial match).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { name: { type: SchemaType.STRING } },
      required: ["name"],
    },
  },
  {
    name: "getPropertyManager",
    description: "Find who manages a named property.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { name: { type: SchemaType.STRING } },
      required: ["name"],
    },
  },
  {
    name: "listOpenMaintenanceTickets",
    description: "List open maintenance work orders, optionally scoped to one property ID.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { propertyId: { type: SchemaType.NUMBER } },
    },
  },
  {
    name: "getWorkOrderAssignee",
    description: "Find who a work order / maintenance ticket is assigned to, by its numeric ID.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { workOrderId: { type: SchemaType.NUMBER } },
      required: ["workOrderId"],
    },
  },
];

export class GeminiIntentParser implements IntentParser {
  private readonly model;

  constructor(apiKey: string, modelName = "gemini-1.5-flash") {
    const client = new GoogleGenerativeAI(apiKey);
    this.model = client.getGenerativeModel({
      model: modelName,
      tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
      systemInstruction:
        "You interpret operational property-management questions and map them to exactly one " +
        "function call from the provided tools. Never answer directly and never invent data — " +
        "if nothing fits, do not call a function.",
    });
  }

  async parse(text: string): Promise<Intent | null> {
    const result = await this.model.generateContent(text);
    const call = result.response.functionCalls()?.[0];
    if (!call) {
      return null;
    }
    return {
      action: call.name as Intent["action"],
      params: (call.args ?? {}) as Intent["params"],
    };
  }
}
