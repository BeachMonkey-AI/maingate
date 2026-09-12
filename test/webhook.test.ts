import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createDatasetLoader } from "../src/data/dataset.js";
import type { Answerer } from "../src/gemini/answerer.js";
import type { OperationalDataset } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, "..", "data", "sample-data.json");

/** Echoes back what it was asked, so tests assert plumbing rather than Gemini's wording. */
function stubAnswerer(): Answerer & { lastQuestion?: string; lastDataset?: OperationalDataset } {
  const stub = {
    lastQuestion: undefined as string | undefined,
    lastDataset: undefined as OperationalDataset | undefined,
    async answer(question: string, dataset: OperationalDataset) {
      stub.lastQuestion = question;
      stub.lastDataset = dataset;
      return `answered: ${question}`;
    },
  };
  return stub;
}

function buildApp(answerer: Answerer) {
  return createApp(createDatasetLoader(dataFile), answerer, {} as NodeJS.ProcessEnv);
}

describe("POST /chat", () => {
  it("strips the @mention and passes the question plus the full dataset to the answerer", async () => {
    const answerer = stubAnswerer();
    const res = await request(buildApp(answerer))
      .post("/chat")
      .send({ message: { text: "@MainGate Show me property 1001" } });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe("answered: Show me property 1001");
    expect(answerer.lastQuestion).toBe("Show me property 1001");
    expect(answerer.lastDataset?.properties).toHaveLength(3);
    expect(answerer.lastDataset?.workOrders).toHaveLength(4);
  });

  it("reads and replies in the Workspace add-on envelope when Chat uses that shape", async () => {
    const res = await request(buildApp(stubAnswerer()))
      .post("/chat")
      .send({ chat: { messagePayload: { message: { text: "@MainGate how many properties?" } } } });

    expect(res.status).toBe(200);
    expect(res.body.hostAppDataAction.chatDataAction.createMessageAction.message.text).toBe(
      "answered: how many properties?",
    );
    expect(res.body.text).toBeUndefined();
  });

  it("responds gracefully to an empty message", async () => {
    const res = await request(buildApp(stubAnswerer()))
      .post("/chat")
      .send({ message: { text: "@MainGate" } });

    expect(res.status).toBe(200);
    expect(res.body.text).toMatch(/didn't catch/i);
  });

  it("responds gracefully instead of crashing when the answerer throws", async () => {
    const throwing: Answerer = {
      answer: async () => {
        throw new Error("upstream API error");
      },
    };
    const res = await request(buildApp(throwing))
      .post("/chat")
      .send({ message: { text: "@MainGate property 1001" } });

    expect(res.status).toBe(200);
    expect(res.body.text).toMatch(/something went wrong/i);
  });

  it("exposes a health check", async () => {
    const res = await request(buildApp(stubAnswerer())).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
