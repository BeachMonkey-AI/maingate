import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createDatasetStore } from "../src/data/dataset.js";
import type { AnswerRequest, Answerer, AnswerOutcome } from "../src/gemini/answerer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, "..", "data", "sample-data.json");

function stubAnswerer(outcome?: AnswerOutcome) {
  const calls: AnswerRequest[] = [];
  const answerer: Answerer = {
    async answer(req) {
      calls.push(req);
      return outcome ?? { kind: "reply", text: `answered: ${req.question}` };
    },
  };
  return { answerer, calls };
}

function buildApp(answerer: Answerer) {
  return createApp(createDatasetStore(dataFile), answerer, {} as NodeJS.ProcessEnv);
}

/** Same as buildApp, but keeps the store so a test can read back what was written. */
function buildAppWithStore(answerer: Answerer) {
  const store = createDatasetStore(dataFile);
  const app = createApp(store, answerer, {} as NodeJS.ProcessEnv);
  const riverbendNotes = async () =>
    (await store.get()).properties.find((p) => p.propertyId === 1004)?.keyBoxNotes ?? "";
  return { app, riverbendNotes };
}

describe("POST /chat", () => {
  it("strips the @mention and passes the question plus the full dataset", async () => {
    const { answerer, calls } = stubAnswerer();
    const res = await request(buildApp(answerer))
      .post("/chat")
      .send({ message: { text: "@MainGate Show me property 1001" } });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe("answered: Show me property 1001");
    expect(calls[0].question).toBe("Show me property 1001");
    expect(calls[0].dataset.properties).toHaveLength(13);
  });

  it("reads and replies in the Workspace add-on envelope when Chat uses that shape", async () => {
    const { answerer } = stubAnswerer();
    const res = await request(buildApp(answerer))
      .post("/chat")
      .send({ chat: { messagePayload: { message: { text: "@MainGate how many properties?" } } } });

    expect(res.status).toBe(200);
    expect(res.body.hostAppDataAction.chatDataAction.createMessageAction.message.text).toBe(
      "answered: how many properties?",
    );
    expect(res.body.text).toBeUndefined();
  });

  const writeIntent = {
    kind: "updateKeyBoxCode",
    request: { propertyId: 1004, location: "front", code: "8888", mode: "add" },
  } as const;

  const sender = { displayName: "Kyle Roeter", email: "kyle@chat.beachmonkey.ai" };
  const space = { name: "spaces/W" };

  async function propose(app: ReturnType<typeof buildApp>) {
    return request(app)
      .post("/chat")
      .send({ space, message: { text: "@MainGate set the front code at Riverbend to 8888", sender } });
  }

  async function say(app: ReturnType<typeof buildApp>, text: string) {
    return request(app).post("/chat").send({ space, message: { text: `@MainGate ${text}`, sender } });
  }

  it("shows a before/after diff and waits rather than writing immediately", async () => {
    const { answerer } = stubAnswerer(writeIntent);
    const { app, riverbendNotes } = buildAppWithStore(answerer);

    const res = await propose(app);
    expect(res.status).toBe(200);
    expect(res.body.text).toContain("BEFORE:");
    expect(res.body.text).toContain("AFTER:");
    expect(res.body.text).toContain("8888");

    expect(await riverbendNotes()).not.toContain("8888");
  });

  it("writes only after an explicit yes", async () => {
    const { answerer } = stubAnswerer(writeIntent);
    const { app, riverbendNotes } = buildAppWithStore(answerer);

    await propose(app);
    const res = await say(app, "yes");

    expect(res.body.text).toMatch(/^Saved\./);
    expect(await riverbendNotes()).toContain("8888");
  });

  it("cancels on no, leaving the data untouched", async () => {
    const { answerer } = stubAnswerer(writeIntent);
    const { app, riverbendNotes } = buildAppWithStore(answerer);

    await propose(app);
    const res = await say(app, "no");

    expect(res.body.text).toMatch(/cancelled/i);
    expect(await riverbendNotes()).not.toContain("8888");
  });

  it("folds an unconfirmed reply in as notes and re-asks, rather than losing the change", async () => {
    // The model often proposes before collecting notes, so the user's next
    // message is usually the notes — not an answer to "yes or no".
    const { answerer } = stubAnswerer(writeIntent);
    const { app, riverbendNotes } = buildAppWithStore(answerer);

    await propose(app);
    const res = await say(app, "lock is sticky needs WD40");

    expect(res.body.text).toContain("lock is sticky needs WD40");
    expect(res.body.text).toContain("AFTER:");
    expect(await riverbendNotes()).not.toContain("8888"); // still unsaved

    const saved = await say(app, "yes");
    expect(saved.body.text).toMatch(/^Saved\./);
    expect(await riverbendNotes()).toContain("lock is sticky needs WD40");
  });

  it("carries conversation history so a clarifying answer has context", async () => {
    const { answerer, calls } = stubAnswerer();
    const app = buildApp(answerer);
    const space = { name: "spaces/AAA" };

    await request(app).post("/chat").send({ space, message: { text: "@MainGate change the code" } });
    await request(app).post("/chat").send({ space, message: { text: "@MainGate the pool gate" } });

    expect(calls[0].history).toHaveLength(0);
    expect(calls[1].history.map((t) => t.text)).toEqual([
      "change the code",
      "answered: change the code",
    ]);
  });

  it("keeps separate conversations apart", async () => {
    const { answerer, calls } = stubAnswerer();
    const app = buildApp(answerer);

    await request(app).post("/chat").send({ space: { name: "spaces/A" }, message: { text: "@MainGate one" } });
    await request(app).post("/chat").send({ space: { name: "spaces/B" }, message: { text: "@MainGate two" } });

    expect(calls[1].history).toHaveLength(0);
  });

  it("responds gracefully to an empty message", async () => {
    const { answerer } = stubAnswerer();
    const res = await request(buildApp(answerer)).post("/chat").send({ message: { text: "@MainGate" } });
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
    const { answerer } = stubAnswerer();
    const res = await request(buildApp(answerer)).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
