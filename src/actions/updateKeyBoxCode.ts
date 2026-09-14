import type { DatasetStore } from "../data/dataset.js";

export interface UpdateKeyBoxCodeRequest {
  propertyId: number;
  /** Human label for which box this is, e.g. "pool gate". */
  location: string;
  code: string;
  mode: "replace" | "add";
  notes?: string;
  /**
   * For mode "replace": the exact existing text this supersedes, so the stale
   * code can be removed. Must appear verbatim in the current notes.
   */
  supersedes?: string;
}

/** A validated change, held until the user confirms it against the diff. */
export interface PendingChange {
  propertyId: number;
  propertyName: string;
  before: string;
  after: string;
  summary: string;
}

export type PrepareResult =
  | { ok: false; message: string }
  | { ok: true; change: PendingChange };

/** Only the key-box field is writable. Nothing else in the dataset is. */
const CODE_PATTERN = /^[A-Za-z0-9#-]{1,24}$/;
const MAX_FIELD = 200;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Code-like tokens, used to check a replacement didn't take neighbours with it. */
function codesIn(text: string): string[] {
  return text.match(/\d{3,8}/g) ?? [];
}

function removedCodes(before: string, after: string): string[] {
  const remaining = codesIn(after);
  const lost: string[] = [];
  for (const code of codesIn(before)) {
    const index = remaining.indexOf(code);
    if (index === -1) {
      lost.push(code);
    } else {
      remaining.splice(index, 1);
    }
  }
  return lost;
}

/** Commas separate fields in the stored record, so they can't appear inside one. */
function sanitize(value: string): string {
  return value.replace(/[\r\n,]+/g, " ").trim();
}

/**
 * Validates a key-box code change and returns what it *would* do. Nothing is
 * written here — the caller shows the before/after to the user and only
 * applies it on an explicit confirmation.
 *
 * The caller (Gemini) supplies only the facts it read from the conversation —
 * which property, which box, the new code, any notes. This function composes
 * the stored line itself, so the date and the attributed user cannot be
 * fabricated upstream. This is the PRD's "Gemini must never write directly to
 * storage" boundary: the model proposes, a human confirms, the backend writes.
 */
export async function prepareKeyBoxCodeChange(
  store: DatasetStore,
  request: UpdateKeyBoxCodeRequest,
  changedBy: string,
): Promise<PrepareResult> {
  const dataset = await store.get();
  const property = dataset.properties.find((p) => p.propertyId === request.propertyId);
  if (!property) {
    return { ok: false, message: `There's no property with id ${request.propertyId}.` };
  }

  const code = request.code?.trim() ?? "";
  if (!CODE_PATTERN.test(code)) {
    return {
      ok: false,
      message: `"${code}" doesn't look like a valid code, so I didn't change anything.`,
    };
  }

  const location = sanitize(request.location ?? "");
  if (!location) {
    return { ok: false, message: "I need to know which box this is before I can change it." };
  }
  if (location.length > MAX_FIELD) {
    return { ok: false, message: "That location description is too long." };
  }

  const notes = sanitize(request.notes ?? "").slice(0, MAX_FIELD);
  const existing = property.keyBoxNotes ?? "";

  let carriedOver = existing;
  if (request.mode === "replace") {
    const supersedes = request.supersedes?.trim();
    if (!supersedes) {
      return { ok: false, message: "I need to know which existing entry this replaces." };
    }
    if (codesIn(supersedes).length > 1) {
      // Caught up front so the model gets a specific correction instead of a
      // generic refusal: it tends to hand over the whole notes string, which
      // is also why the message must not echo it back into the chat.
      return {
        ok: false,
        message:
          `That covers more than one code (${codesIn(supersedes).join(", ")}), so I didn't change ` +
          `anything. Tell me which single entry to replace.`,
      };
    }
    if (!existing.includes(supersedes)) {
      // Guards against removing text that isn't actually there, which would
      // silently keep a stale code alongside the new one.
      return {
        ok: false,
        message: `I couldn't find "${supersedes}" in the current notes for ${property.name}, so I left them alone.`,
      };
    }
    carriedOver = existing
      .replace(supersedes, "")
      .replace(/\s*,\s*([.,])/g, "$1") // cutting mid-sentence leaves ", ." behind
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,]+|[\s,]+$/g, "");
  }

  const record = [code, location, today(), changedBy, notes].filter(Boolean).join(", ");
  const updated = carriedOver ? `${carriedOver}\n${record}` : record;

  // A replacement retires exactly one code. Anything more means `supersedes`
  // was too broad — the model has handed us a span covering other boxes, and
  // applying it would silently delete codes nobody asked to change.
  const lost = removedCodes(existing, updated).filter((c) => c !== code);
  const allowed = request.mode === "replace" ? 1 : 0;
  if (lost.length > allowed) {
    return {
      ok: false,
      message:
        `That would have removed ${lost.join(", ")} from ${property.name} as well, so I stopped. ` +
        `Tell me exactly which entry to replace and I'll try again.`,
    };
  }

  const verb = request.mode === "replace" ? "Update" : "Add";
  return {
    ok: true,
    change: {
      propertyId: property.propertyId,
      propertyName: property.name,
      before: existing,
      after: updated,
      summary: `${verb} the ${location} code at ${property.name} to ${code}`,
    },
  };
}

/** Applies a change the user has confirmed. */
export async function applyKeyBoxCodeChange(
  store: DatasetStore,
  change: PendingChange,
): Promise<void> {
  await store.setKeyBoxNotes(change.propertyId, change.after);
}

/** The confirmation prompt: what it is now, what it becomes. */
export function describeChange(change: PendingChange): string {
  return [
    `${change.summary}.`,
    "",
    "BEFORE:",
    change.before || "(nothing recorded)",
    "",
    "AFTER:",
    change.after,
    "",
    "Reply 'yes' to save this, or 'no' to cancel.",
  ].join("\n");
}
