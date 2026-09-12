import type { Request, Response } from "express";
import { executeIntent } from "../actions/registry.js";
import type { DataStore } from "../data/store.js";
import type { IntentParser } from "../intent/parser.js";

interface ChatMessage {
  text?: string;
  sender?: { displayName?: string; email?: string };
}

/**
 * Google Chat delivers MESSAGE events in one of two shapes depending on how
 * the app is registered: a plain Chat app posts the message at the top level,
 * while an app built as a Workspace add-on nests it under `chat.messagePayload`
 * and expects its reply wrapped in a hostAppDataAction envelope. This app is
 * registered as an add-on (that setting is effectively one-way once cleared),
 * but both shapes are handled so local curl testing stays simple.
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

export function createChatWebhookHandler(store: DataStore, intentParser: IntentParser) {
  return async function handleChatWebhook(req: Request, res: Response): Promise<void> {
    const event = req.body as ChatEvent;
    const isAddOn = Boolean(event.chat);
    const message = event.chat?.messagePayload?.message ?? event.message;
    const text = stripMention(message?.text ?? "");

    const reply = (body: string): void => {
      if (isAddOn) {
        res.json({
          hostAppDataAction: { chatDataAction: { createMessageAction: { message: { text: body } } } },
        });
      } else {
        res.json({ text: body });
      }
    };

    if (!text) {
      reply("I didn't catch a question in that message — try `@MainGate show me property 1001`.");
      return;
    }

    let intent;
    try {
      intent = await intentParser.parse(text);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Intent parsing failed:", err instanceof Error ? err.message : err);
      reply("Something went wrong understanding that — please try again in a moment.");
      return;
    }
    if (!intent) {
      reply(
        "I couldn't match that to something I can look up yet. Try asking about a property " +
          "(by name or ID), a property's manager, open maintenance tickets, or a work order's assignee.",
      );
      return;
    }

    const result = await executeIntent(store, intent);
    reply(result.message);
  };
}
