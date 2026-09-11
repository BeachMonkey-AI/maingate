import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { JsonDataStore } from "../src/data/jsonDataStore.js";
import { RuleBasedIntentParser } from "../src/intent/ruleBasedIntentParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, "..", "data", "sample-data.json");

function buildApp() {
  const store = new JsonDataStore(dataFile);
  return createApp(store, new RuleBasedIntentParser(), {} as NodeJS.ProcessEnv);
}

describe("POST /chat", () => {
  it("answers a property lookup sent the way Google Chat formats it", async () => {
    const res = await request(buildApp())
      .post("/chat")
      .send({ message: { text: "@MainGateBot Show me property 1001" } });

    expect(res.status).toBe(200);
    expect(res.body.text).toContain("Madison Apartments");
  });

  it("responds gracefully to an empty message", async () => {
    const res = await request(buildApp()).post("/chat").send({ message: { text: "@MainGateBot" } });
    expect(res.status).toBe(200);
    expect(res.body.text).toMatch(/didn't catch/i);
  });

  it("responds gracefully when nothing matches an intent", async () => {
    const res = await request(buildApp())
      .post("/chat")
      .send({ message: { text: "@MainGateBot what's the weather like" } });
    expect(res.status).toBe(200);
    expect(res.body.text).toMatch(/couldn't match/i);
  });

  it("exposes a health check", async () => {
    const res = await request(buildApp()).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
