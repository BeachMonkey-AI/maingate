import express, { type Express } from "express";
import { createConversationStore } from "./chat/conversation.js";
import { createChatRequestVerifier } from "./chat/verify.js";
import { createChatWebhookHandler } from "./chat/webhook.js";
import type { DatasetStore } from "./data/dataset.js";
import type { Answerer } from "./gemini/answerer.js";

export function createApp(
  store: DatasetStore,
  answerer: Answerer,
  env: NodeJS.ProcessEnv = process.env,
): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post(
    "/chat",
    createChatRequestVerifier(env.GOOGLE_CHAT_PROJECT_NUMBER, env.GOOGLE_CHAT_AUDIENCE),
    createChatWebhookHandler(store, answerer, createConversationStore()),
  );

  return app;
}
