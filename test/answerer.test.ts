import { describe, expect, it, vi, beforeEach } from "vitest";

const generateContent = vi.hoisted(() => vi.fn());
const getGenerativeModel = vi.hoisted(() => vi.fn(() => ({ generateContent })));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel = getGenerativeModel;
  },
  SchemaType: { OBJECT: "object", STRING: "string", NUMBER: "number" },
}));

const { GeminiAnswerer } = await import("../src/gemini/answerer.js");

const dataset = { properties: [], workOrders: [], vendors: [] };
const ask = { question: "q", dataset, history: [] };
const overloaded = () =>
  new Error("[GoogleGenerativeAI Error]: Error fetching from ...: [503 Service Unavailable] high demand");

describe("GeminiAnswerer model failover", () => {
  beforeEach(() => {
    generateContent.mockReset();
    getGenerativeModel.mockClear();
  });

  it("falls through to the next model when one is overloaded", async () => {
    generateContent
      .mockRejectedValueOnce(overloaded())
      .mockResolvedValueOnce({ response: { text: () => "  answer from the backup  ", functionCalls: () => undefined } });

    const answerer = new GeminiAnswerer("key", ["primary", "backup"]);
    await expect(answerer.answer(ask)).resolves.toEqual({ kind: "reply", text: "answer from the backup" });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("gives up only after every model is exhausted", async () => {
    generateContent.mockRejectedValue(overloaded());

    const answerer = new GeminiAnswerer("key", ["a", "b", "c"]);
    await expect(answerer.answer(ask)).rejects.toThrow(/503/);
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("treats a timeout as transient and falls through", async () => {
    generateContent
      .mockRejectedValueOnce(new Error("Request aborted due to timeout"))
      .mockResolvedValueOnce({ response: { text: () => "answer", functionCalls: () => undefined } });

    const answerer = new GeminiAnswerer("key", ["slow", "fast"]);
    await expect(answerer.answer(ask)).resolves.toEqual({ kind: "reply", text: "answer" });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("sticks with the model that worked instead of re-paying the timeout each time", async () => {
    generateContent
      .mockRejectedValueOnce(overloaded())
      .mockResolvedValueOnce({ response: { text: () => "first", functionCalls: () => undefined } })
      .mockResolvedValueOnce({ response: { text: () => "second", functionCalls: () => undefined } });

    const answerer = new GeminiAnswerer("key", ["dead", "alive"]);
    await expect(answerer.answer(ask)).resolves.toEqual({ kind: "reply", text: "first" });
    await expect(answerer.answer(ask)).resolves.toEqual({ kind: "reply", text: "second" });

    // 2 calls for the first question (dead, then alive), 1 for the second.
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("surfaces a write as a request for the backend to validate, not a done deal", async () => {
    const args = { propertyId: 1002, location: "pool gate", code: "9098", mode: "replace" };
    generateContent.mockResolvedValueOnce({
      response: { text: () => "", functionCalls: () => [{ name: "updateKeyBoxCode", args }] },
    });

    const answerer = new GeminiAnswerer("key", ["a"]);
    await expect(answerer.answer(ask)).resolves.toEqual({ kind: "updateKeyBoxCode", request: args });
  });

  it("passes prior turns so a clarifying answer has context", async () => {
    generateContent.mockResolvedValueOnce({
      response: { text: () => "ok", functionCalls: () => undefined },
    });

    const answerer = new GeminiAnswerer("key", ["a"]);
    await answerer.answer({
      question: "the pool gate",
      dataset,
      history: [
        { role: "user", text: "change the code" },
        { role: "model", text: "which one?" },
      ],
    });

    const { contents } = generateContent.mock.calls[0][0];
    expect(contents).toHaveLength(3);
    expect(contents[0]).toEqual({ role: "user", parts: [{ text: "change the code" }] });
    expect(contents[2].parts[0].text).toContain("the pool gate");
  });

  it("does not burn through models on a non-transient error", async () => {
    generateContent.mockRejectedValue(new Error("[400 Bad Request] malformed prompt"));

    const answerer = new GeminiAnswerer("key", ["a", "b", "c"]);
    await expect(answerer.answer(ask)).rejects.toThrow(/400/);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
