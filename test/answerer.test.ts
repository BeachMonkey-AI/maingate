import { describe, expect, it, vi, beforeEach } from "vitest";

const generateContent = vi.hoisted(() => vi.fn());
const getGenerativeModel = vi.hoisted(() => vi.fn(() => ({ generateContent })));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel = getGenerativeModel;
  },
}));

const { GeminiAnswerer } = await import("../src/gemini/answerer.js");

const dataset = { properties: [], workOrders: [], vendors: [] };
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
      .mockResolvedValueOnce({ response: { text: () => "  answer from the backup  " } });

    const answerer = new GeminiAnswerer("key", ["primary", "backup"]);
    await expect(answerer.answer("q", dataset)).resolves.toBe("answer from the backup");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("gives up only after every model is exhausted", async () => {
    generateContent.mockRejectedValue(overloaded());

    const answerer = new GeminiAnswerer("key", ["a", "b", "c"]);
    await expect(answerer.answer("q", dataset)).rejects.toThrow(/503/);
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("treats a timeout as transient and falls through", async () => {
    generateContent
      .mockRejectedValueOnce(new Error("Request aborted due to timeout"))
      .mockResolvedValueOnce({ response: { text: () => "answer" } });

    const answerer = new GeminiAnswerer("key", ["slow", "fast"]);
    await expect(answerer.answer("q", dataset)).resolves.toBe("answer");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("sticks with the model that worked instead of re-paying the timeout each time", async () => {
    generateContent
      .mockRejectedValueOnce(overloaded())
      .mockResolvedValueOnce({ response: { text: () => "first" } })
      .mockResolvedValueOnce({ response: { text: () => "second" } });

    const answerer = new GeminiAnswerer("key", ["dead", "alive"]);
    await expect(answerer.answer("q", dataset)).resolves.toBe("first");
    await expect(answerer.answer("q", dataset)).resolves.toBe("second");

    // 2 calls for the first question (dead, then alive), 1 for the second.
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("does not burn through models on a non-transient error", async () => {
    generateContent.mockRejectedValue(new Error("[400 Bad Request] malformed prompt"));

    const answerer = new GeminiAnswerer("key", ["a", "b", "c"]);
    await expect(answerer.answer("q", dataset)).rejects.toThrow(/400/);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
