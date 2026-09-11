import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { JsonDataStore } from "../src/data/jsonDataStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, "..", "data", "sample-data.json");

describe("JsonDataStore", () => {
  it("gets a property by id", async () => {
    const store = new JsonDataStore(dataFile);
    const property = await store.getProperty(1001);
    expect(property?.name).toBe("Madison Apartments");
  });

  it("returns null for an unknown property id", async () => {
    const store = new JsonDataStore(dataFile);
    expect(await store.getProperty(9999)).toBeNull();
  });

  it("finds a property by partial name, case-insensitively", async () => {
    const store = new JsonDataStore(dataFile);
    const property = await store.findPropertyByName("harbor view");
    expect(property?.propertyId).toBe(1002);
  });

  it("filters work orders by property and status", async () => {
    const store = new JsonDataStore(dataFile);
    const open = await store.listWorkOrders({ propertyId: 1001, status: "Open" });
    expect(open.map((wo) => wo.workOrderId)).toEqual([456]);
  });

  it("gets a work order by id", async () => {
    const store = new JsonDataStore(dataFile);
    const wo = await store.getWorkOrder(458);
    expect(wo?.assignedTo).toBe("Dana Wu");
  });
});
