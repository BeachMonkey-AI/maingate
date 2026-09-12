import type { Request, Response } from "express";
import type { OperationalDataset } from "../types.js";
import type { Answerer } from "../gemini/answerer.js";

interface ChatMessage {
  text?: string;
  sender?: { displayName?: string; email?: string };
}

/**
 * Google Chat delivers MESSAGE events in one of two shapes depending on how
 * the app is registered: a plain Chat app posts the message at the top level,
 * while an app built as a Workspace add-on nests it under `chat.messagePayload`
 * and expects its reply wrapped in a hostAppDataAction envelope. This app is
 * registered as an add-on, but both shapes are handled so local curl testing
 * stays simple.
 */
interface ChatEvent {
  message?: ChatMessage;
  chat?: {
    messagePayload?: { message?: ChatMessage };
  };
}

/** Strips the leading @MainGate mention Chat includes in the message text. */
function stripMention(text: string): string {
  return text.replace(/^@\S+\s*/, "").trim();
}

export function createChatWebhookHandler(
  loadDataset: () => Promise<OperationalDataset>,
  answerer: Answerer,
) {
  return async function handleChatWebhook(req: Request, res: Response): Promise<void> {
    const event = req.body as ChatEvent;
    const isAddOn = Boolean(event.chat);
    const message = event.chat?.messagePayload?.message ?? event.message;
    const question = stripMention(message?.text ?? "");

    const reply = (body: string): void => {
      if (isAddOn) {
        res.json({
          hostAppDataAction: { chatDataAction: { createMessageAction: { message: { text: body } } } },
        });
      } else {
        res.json({ text: body });
      }
    };

    if (!question) {
      reply("I didn't catch a question in that message — try `@MainGate show me property 1001`.");
      return;
    }

    try {
      const dataset = await loadDataset();
      reply(await answerer.answer(question, dataset));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to answer:", err instanceof Error ? err.message : err);
      reply("Something went wrong answering that — please try again in a moment.");
    }
  };
}
