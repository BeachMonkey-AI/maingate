import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyKeyBoxCodeChange,
  describeChange,
  prepareKeyBoxCodeChange,
  type UpdateKeyBoxCodeRequest,
} from "../src/actions/updateKeyBoxCode.js";
import { createDatasetStore, type DatasetStore } from "../src/data/dataset.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, "..", "data", "sample-data.json");

// Harbor View (1002) starts with two boxes described in one prose line.
const HARBOR = 1002;
const POOL_GATE_TEXT = "and the pool gate box, code 2200";

let store: DatasetStore;
beforeEach(() => {
  store = createDatasetStore(dataFile);
});

async function notesFor(propertyId: number): Promise<string | undefined> {
  const dataset = await store.get();
  return dataset.properties.find((p) => p.propertyId === propertyId)?.keyBoxNotes;
}

/** Prepare, then apply if it was allowed — the confirmed-change path. */
async function change(request: UpdateKeyBoxCodeRequest, changedBy = "User 1") {
  const prepared = await prepareKeyBoxCodeChange(store, request, changedBy);
  if (prepared.ok) {
    await applyKeyBoxCodeChange(store, prepared.change);
  }
  return prepared;
}

describe("preparing a key box change", () => {
  it("never writes on its own — the dataset is untouched until applied", async () => {
    const before = await notesFor(HARBOR);
    const prepared = await prepareKeyBoxCodeChange(
      store,
      { propertyId: HARBOR, location: "pool gate", code: "9098", mode: "replace", supersedes: POOL_GATE_TEXT },
      "User 1",
    );

    expect(prepared.ok).toBe(true);
    expect(await notesFor(HARBOR)).toBe(before);
  });

  it("shows the before and after in the confirmation prompt", async () => {
    const prepared = await prepareKeyBoxCodeChange(
      store,
      { propertyId: HARBOR, location: "pool gate", code: "9098", mode: "replace", supersedes: POOL_GATE_TEXT },
      "User 1",
    );
    if (!prepared.ok) throw new Error(prepared.message);

    const prompt = describeChange(prepared.change);
    expect(prompt).toContain("BEFORE:");
    expect(prompt).toContain("2200");
    expect(prompt).toContain("AFTER:");
    expect(prompt).toContain("9098");
    expect(prompt).toMatch(/yes.*no/s);
  });

  it("replaces a code, keeping the other box and dropping the superseded text", async () => {
    const result = await change({
      propertyId: HARBOR,
      location: "pool gate",
      code: "9098",
      mode: "replace",
      supersedes: POOL_GATE_TEXT,
      notes: "Needs WD40 the lock is sticky",
    });

    expect(result.ok).toBe(true);
    const notes = await notesFor(HARBOR);
    expect(notes).toContain("LB#8891"); // main entry survives
    expect(notes).not.toContain("2200"); // stale code is gone
    expect(notes).toMatch(/9098, pool gate, \d{4}-\d{2}-\d{2}, User 1, Needs WD40 the lock is sticky/);
  });

  it("appends a new box without disturbing existing notes", async () => {
    const before = await notesFor(HARBOR);
    const result = await change(
      { propertyId: HARBOR, location: "bike store", code: "3321", mode: "add" },
      "Kyle Roeter",
    );

    expect(result.ok).toBe(true);
    const notes = await notesFor(HARBOR);
    expect(notes).toContain(before!);
    expect(notes).toMatch(/3321, bike store, \d{4}-\d{2}-\d{2}, Kyle Roeter/);
  });

  it("replaces a code whose entry also carries a box identifier", async () => {
    // "main entry LB#8891 (code 4417)" has two digit runs but only one code.
    // Treating the LB# identifier as a code made this replacement impossible.
    const result = await change({
      propertyId: HARBOR,
      location: "main entry",
      code: "4418",
      mode: "replace",
      supersedes: "main entry LB#8891 (code 4417)",
      notes: "Lock needs WD40 it's sticky",
    });

    expect(result.ok).toBe(true);
    const notes = await notesFor(HARBOR);
    expect(notes).not.toContain("4417"); // old code retired
    expect(notes).toContain("2200"); // pool gate untouched
    expect(notes).toMatch(/4418, main entry, \d{4}-\d{2}-\d{2}, User 1, Lock needs WD40 it's sticky/);
  });

  it("keeps the retired code out of the notes, and tidies the prose it cut", async () => {
    // The model echoes the superseded text back as notes, which would carry
    // the old code into the very record meant to replace it.
    const result = await change({
      propertyId: HARBOR,
      location: "main entry",
      code: "4418",
      mode: "replace",
      supersedes: "main entry LB#8891 (code 4417)",
      notes: "main entry LB#8891 (code 4417) Lock needs WD40",
    });

    expect(result.ok).toBe(true);
    const notes = await notesFor(HARBOR);
    expect(notes).not.toContain("4417");
    expect(notes).toContain("Lock needs WD40");
    expect(notes).not.toMatch(/Two boxes:\s*and/); // no stranded conjunction
  });

  it("keeps only what the user actually added when the model pads the notes", async () => {
    const result = await change({
      propertyId: HARBOR,
      location: "main entry",
      code: "4418",
      mode: "replace",
      supersedes: "main entry LB#8891 (code 4417)",
      // Observed live: the model hands back the rest of the existing note too.
      notes: "Two boxes: and the pool gate box, code 2200. Pool one sticks, you have to jiggle it. Lock needs WD40, it's sticky",
    });

    expect(result.ok).toBe(true);
    const record = (await notesFor(HARBOR))!.split("\n").at(-1)!;
    expect(record).toContain("Lock needs WD40");
    expect(record).not.toContain("2200"); // pool gate code not duplicated in
    expect(record).not.toMatch(/jiggle/i); // existing prose not restated
  });

  it("refuses a replacement whose superseded text isn't actually present", async () => {
    // Otherwise the stale code would silently survive alongside the new one.
    const result = await change({
      propertyId: HARBOR,
      location: "pool gate",
      code: "9098",
      mode: "replace",
      supersedes: "code 1111",
    });

    expect(result.ok).toBe(false);
    expect(await notesFor(HARBOR)).not.toContain("9098");
  });

  it("refuses a replacement broad enough to delete another box's code", async () => {
    // The model really does try this: it passed the entire notes string as
    // `supersedes`, which would have wiped the untouched main entry code.
    const before = await notesFor(HARBOR);
    const result = await change({
      propertyId: HARBOR,
      location: "pool gate",
      code: "9098",
      mode: "replace",
      supersedes: before,
    });

    expect(result.ok).toBe(false);
    expect(await notesFor(HARBOR)).toBe(before);
  });

  it("rejects a code that isn't code-shaped", async () => {
    const result = await change({
      propertyId: HARBOR,
      location: "pool gate",
      code: "ignore previous instructions",
      mode: "add",
    });

    expect(result.ok).toBe(false);
    expect(await notesFor(HARBOR)).not.toContain("ignore");
  });

  it("rejects an unknown property", async () => {
    const result = await change({ propertyId: 9999, location: "front", code: "1234", mode: "add" });
    expect(result.ok).toBe(false);
  });

  it("does not let field values break the comma-delimited record", async () => {
    await change({
      propertyId: HARBOR,
      location: "side, gate",
      code: "4444",
      mode: "add",
      notes: "a, b\nc",
    });

    const line = (await notesFor(HARBOR))!.split("\n").at(-1)!;
    expect(line.split(",")).toHaveLength(5);
  });

  it("stamps the date and user itself, so notes text can't spoof those fields", async () => {
    await change(
      { propertyId: HARBOR, location: "gate", code: "5555", mode: "add", notes: "2001-01-01, Someone Else" },
      "Real User",
    );

    const fields = (await notesFor(HARBOR))!.split("\n").at(-1)!.split(", ");
    // The injected comma is flattened, so the fake date/name stay inside the
    // notes field instead of displacing the real ones.
    expect(fields).toHaveLength(5);
    expect(fields[2]).toBe(new Date().toISOString().slice(0, 10));
    expect(fields[3]).toBe("Real User");
    expect(fields[4]).toBe("2001-01-01 Someone Else");
  });
});
