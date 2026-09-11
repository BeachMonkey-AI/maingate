import type { Request, Response } from "express";
import { executeIntent } from "../actions/registry.js";
import type { DataStore } from "../data/store.js";
import type { IntentParser } from "../intent/parser.js";

/**
 * Minimal shape of a Google Chat MESSAGE event we actually use.
 * https://developers.google.com/workspace/chat/api/reference/rest/v1/spaces.messages
 */
interface ChatEvent {
  message?: {
    text?: string;
    sender?: { displayName?: string; email?: string };
  };
}

/** Strips the leading @MainGateBot mention Chat includes in the message text. */
function stripMention(text: string): string {
  return text.replace(/^@\S+\s*/, "").trim();
}

export function createChatWebhookHandler(store: DataStore, intentParser: IntentParser) {
  return async function handleChatWebhook(req: Request, res: Response): Promise<void> {
    const event = req.body as ChatEvent;
    const rawText = event.message?.text ?? "";
    const text = stripMention(rawText);

    if (!text) {
      res.json({ text: "I didn't catch a question in that message — try `@MainGateBot show me property 1001`." });
      return;
    }

    let intent;
    try {
      intent = await intentParser.parse(text);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Intent parsing failed:", err instanceof Error ? err.message : err);
      res.json({ text: "Something went wrong understanding that — please try again in a moment." });
      return;
    }
    if (!intent) {
      res.json({
        text:
          "I couldn't match that to something I can look up yet. Try asking about a property " +
          "(by name or ID), a property's manager, open maintenance tickets, or a work order's assignee.",
      });
      return;
    }

    const result = await executeIntent(store, intent);
    res.json({ text: result.message });
  };
}
