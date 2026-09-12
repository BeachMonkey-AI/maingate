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
  "Replies are shown in a Google Chat message: keep them short and",
  "conversational, use plain text rather than markdown tables, and list items",
  "one per line when there are several.",
].join(" ");

export class GeminiAnswerer implements Answerer {
  private readonly model;

  constructor(apiKey: string, modelName = "gemini-flash-latest") {
    const client = new GoogleGenerativeAI(apiKey);
    this.model = client.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_INSTRUCTION,
    });
  }

  async answer(question: string, dataset: OperationalDataset): Promise<string> {
    const result = await this.model.generateContent(
      `DATA:\n${JSON.stringify(dataset)}\n\nQUESTION: ${question}`,
    );
    return result.response.text().trim();
  }
}
