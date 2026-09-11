import { describe, expect, it } from "vitest";
import { RuleBasedIntentParser } from "../src/intent/ruleBasedIntentParser.js";

describe("RuleBasedIntentParser", () => {
  const parser = new RuleBasedIntentParser();

  it("parses 'show me property 1001'", async () => {
    await expect(parser.parse("Show me property 1001")).resolves.toEqual({
      action: "getProperty",
      params: { propertyId: 1001 },
    });
  });

  it("parses 'who manages Madison Apartments'", async () => {
    await expect(parser.parse("Who manages Madison Apartments?")).resolves.toEqual({
      action: "getPropertyManager",
      params: { name: "Madison Apartments" },
    });
  });

  it("parses 'list open maintenance tickets'", async () => {
    await expect(parser.parse("List open maintenance tickets")).resolves.toEqual({
      action: "listOpenMaintenanceTickets",
      params: {},
    });
  });

  it("parses 'who is assigned to work order 456'", async () => {
    await expect(parser.parse("Who is assigned to work order 456?")).resolves.toEqual({
      action: "getWorkOrderAssignee",
      params: { workOrderId: 456 },
    });
  });

  it("falls back to a name lookup for a bare property name", async () => {
    await expect(parser.parse("Madison Apartments")).resolves.toEqual({
      action: "findPropertyByName",
      params: { name: "Madison Apartments" },
    });
  });
});
