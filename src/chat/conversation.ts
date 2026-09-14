export interface Turn {
  role: "user" | "model";
  text: string;
}

const MAX_TURNS = 8;
const TTL_MS = 30 * 60 * 1000;

/**
 * Remembers the last few turns per conversation so a clarifying question
 * ("which code — main entry or pool gate?") can be answered by a follow-up
 * that would be meaningless on its own.
 *
 * In memory, like the dataset: a restart or a second instance loses the
 * thread, and the user would just have to restate their request.
 */
export function createConversationStore() {
  const threads = new Map<string, { turns: Turn[]; updatedAt: number }>();

  const prune = (now: number) => {
    for (const [key, thread] of threads) {
      if (now - thread.updatedAt > TTL_MS) {
        threads.delete(key);
      }
    }
  };

  return {
    history(key: string): Turn[] {
      const now = Date.now();
      prune(now);
      const thread = threads.get(key);
      return thread ? thread.turns : [];
    },
    record(key: string, ...turns: Turn[]): void {
      const now = Date.now();
      const thread = threads.get(key) ?? { turns: [], updatedAt: now };
      thread.turns = [...thread.turns, ...turns].slice(-MAX_TURNS);
      thread.updatedAt = now;
      threads.set(key, thread);
    },
  };
}

export type ConversationStore = ReturnType<typeof createConversationStore>;
