import type { Intent } from "../types.js";
import type { IntentParser } from "./parser.js";

/**
 * Deterministic fallback parser. Used in tests and local dev so behavior
 * doesn't depend on network access or a Gemini API key, and as a safety net
 * if the Gemini call fails or returns something outside the action
 * allowlist. Deliberately narrow — it only needs to cover the Phase 1
 * examples from the PRD, not general natural language.
 */
export class RuleBasedIntentParser implements IntentParser {
  async parse(text: string): Promise<Intent | null> {
    const t = text.trim();

    let m = t.match(/property\s+(\d+)/i);
    if (m) {
      return { action: "getProperty", params: { propertyId: Number(m[1]) } };
    }

    m = t.match(/who\s+(?:manages|is\s+the\s+manager\s+(?:of|for))\s+(.+?)\??$/i);
    if (m) {
      return { action: "getPropertyManager", params: { name: m[1].trim() } };
    }

    m = t.match(/(?:open|list open|show open)\s+(?:maintenance\s+)?tickets?(?:\s+for\s+property\s+(\d+))?/i);
    if (m) {
      const params: Record<string, string | number> = {};
      if (m[1]) params.propertyId = Number(m[1]);
      return { action: "listOpenMaintenanceTickets", params };
    }

    m = t.match(/who(?:'s| is)\s+assigned\s+to\s+(?:work\s*order|ticket)\s+(\d+)/i);
    if (m) {
      return { action: "getWorkOrderAssignee", params: { workOrderId: Number(m[1]) } };
    }

    m = t.match(/(.+)/);
    if (m && /^[A-Za-z][A-Za-z0-9 ]+$/.test(t) && t.length < 60) {
      // Bare name lookup, e.g. "Madison Apartments"
      return { action: "findPropertyByName", params: { name: t } };
    }

    return null;
  }
}
