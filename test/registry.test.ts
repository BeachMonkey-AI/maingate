import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { executeIntent, SUPPORTED_ACTIONS } from "../src/actions/registry.js";
import { JsonDataStore } from "../src/data/jsonDataStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, "..", "data", "sample-data.json");
const store = new JsonDataStore(dataFile);

describe("executeIntent", () => {
  it("only exposes Phase 1 read-only actions", () => {
    expect(SUPPORTED_ACTIONS.sort()).toEqual(
      [
        "findPropertyByName",
        "getProperty",
        "getPropertyManager",
        "getWorkOrderAssignee",
        "listOpenMaintenanceTickets",
      ].sort(),
    );
  });

  it("rejects Phase 2 actions even if a caller (e.g. Gemini) proposes one", async () => {
    const result = await executeIntent(store, {
      action: "updateWorkOrderStatus",
      params: { workOrderId: 456, status: "Completed" },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not available|read-only/i);
  });

  it("getProperty returns a formatted message and the raw record", async () => {
    const result = await executeIntent(store, { action: "getProperty", params: { propertyId: 1001 } });
    expect(result.ok).toBe(true);
    expect(result.message).toContain("Madison Apartments");
    expect(result.data).toMatchObject({ propertyId: 1001 });
  });

  it("getProperty reports a clean not-found message for an unknown id", async () => {
    const result = await executeIntent(store, { action: "getProperty", params: { propertyId: 9999 } });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("9999");
  });

  it("listOpenMaintenanceTickets scopes to a property when given one", async () => {
    const result = await executeIntent(store, {
      action: "listOpenMaintenanceTickets",
      params: { propertyId: 1002 },
    });
    expect(result.ok).toBe(true);
    expect(result.message).toContain("#458");
  });

  it("surfaces a clear error when a required param is missing", async () => {
    const result = await executeIntent(store, { action: "getProperty", params: {} });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("propertyId");
  });
});
