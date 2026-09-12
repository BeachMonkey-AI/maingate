import express, { type Express } from "express";
import { createChatRequestVerifier } from "./chat/verify.js";
import { createChatWebhookHandler } from "./chat/webhook.js";
import type { DataStore } from "./data/store.js";
import type { IntentParser } from "./intent/parser.js";

export function createApp(store: DataStore, intentParser: IntentParser, env: NodeJS.ProcessEnv = process.env): Express {
  const app = express();
  app.use(express.json());

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.post(
    "/chat",
    createChatRequestVerifier(env.GOOGLE_CHAT_PROJECT_NUMBER, env.GOOGLE_CHAT_AUDIENCE),
    createChatWebhookHandler(store, intentParser),
  );

  return app;
}
