import type { Request, Response } from "express";
import {
  applyKeyBoxCodeChange,
  describeChange,
  prepareKeyBoxCodeChange,
  type PendingChange,
  type UpdateKeyBoxCodeRequest,
} from "../actions/updateKeyBoxCode.js";
import type { DatasetStore } from "../data/dataset.js";
import type { Answerer } from "../gemini/answerer.js";
import type { ConversationStore } from "./conversation.js";

/**
 * Confirmation is matched here rather than asked of the model, so whether a
 * write happens is never a judgement call. Only an explicit yes saves; the
 * failure mode is "didn't save", never "saved something unintended".
 */
const AFFIRMATIVE = /^(y|yes|yep|yeah|ok|okay|sure|confirm|confirmed|do it|go ahead|save|save it)\b[.!]?$/i;
const NEGATIVE = /^(n|no|nope|cancel|stop|nevermind|never mind|don't|dont)\b[.!]?$/i;

interface ChatMessage {
  text?: string;
  sender?: { displayName?: string; email?: string };
}

interface ChatSpace {
  name?: string;
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
  space?: ChatSpace;
  chat?: {
    messagePayload?: { message?: ChatMessage; space?: ChatSpace };
  };
}

/** Strips the leading @MainGate mention Chat includes in the message text. */
function stripMention(text: string): string {
  return text.replace(/^@\S+\s*/, "").trim();
}

export function createChatWebhookHandler(
  store: DatasetStore,
  answerer: Answerer,
  conversations: ConversationStore,
) {
  // The originating request is kept alongside the change so an unconfirmed
  // reply can be folded in as notes and re-proposed, rather than thrown away.
  const pending = new Map<string, { change: PendingChange; request: UpdateKeyBoxCodeRequest }>();

  return async function handleChatWebhook(req: Request, res: Response): Promise<void> {
    const event = req.body as ChatEvent;
    const isAddOn = Boolean(event.chat);
    const payload = event.chat?.messagePayload;
    const message = payload?.message ?? event.message;
    const space = payload?.space ?? event.space;
    const question = stripMention(message?.text ?? "");

    const sender = message?.sender;
    const changedBy = sender?.displayName || sender?.email || "unknown user";
    const threadKey = space?.name ?? sender?.email ?? "default";

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

    const finish = (text: string): void => {
      conversations.record(threadKey, { role: "user", text: question }, { role: "model", text });
      reply(text);
    };

    // A change awaiting confirmation short-circuits everything else, so an
    // unrelated follow-up can't be mistaken for approval.
    const awaiting = pending.get(threadKey);
    if (awaiting) {
      const answer = question.trim();

      if (AFFIRMATIVE.test(answer)) {
        pending.delete(threadKey);
        await applyKeyBoxCodeChange(store, awaiting.change);
        finish(`Saved. ${awaiting.change.summary}.`);
        return;
      }
      if (NEGATIVE.test(answer)) {
        pending.delete(threadKey);
        finish("Cancelled — nothing was changed.");
        return;
      }

      // Anything else is almost always the notes the user still wanted to add,
      // so fold it in and re-propose instead of discarding their change.
      const request = {
        ...awaiting.request,
        notes: [awaiting.request.notes, answer].filter(Boolean).join(" "),
      };
      const reworked = await prepareKeyBoxCodeChange(store, request, changedBy);
      if (!reworked.ok) {
        pending.delete(threadKey);
        finish(reworked.message);
        return;
      }
      pending.set(threadKey, { change: reworked.change, request });
      finish(describeChange(reworked.change));
      return;
    }

    try {
      const outcome = await answerer.answer({
        question,
        dataset: await store.get(),
        history: conversations.history(threadKey),
      });

      if (outcome.kind === "reply") {
        finish(outcome.text);
        return;
      }

      const prepared = await prepareKeyBoxCodeChange(store, outcome.request, changedBy);
      if (!prepared.ok) {
        finish(prepared.message);
        return;
      }
      pending.set(threadKey, { change: prepared.change, request: outcome.request });
      finish(describeChange(prepared.change));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to answer:", err instanceof Error ? err.message : err);
      reply("Something went wrong answering that — please try again in a moment.");
    }
  };
}
