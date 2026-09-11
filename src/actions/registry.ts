import type { DataStore } from "../data/store.js";
import type { ActionName, ActionResult, Intent } from "../types.js";

type ActionHandler = (store: DataStore, params: Record<string, string | number>) => Promise<ActionResult>;

function requireNumber(params: Record<string, string | number>, key: string): number {
  const value = params[key];
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`Missing or invalid numeric parameter "${key}"`);
  }
  return num;
}

function requireString(params: Record<string, string | number>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing or invalid string parameter "${key}"`);
  }
  return value;
}

const getProperty: ActionHandler = async (store, params) => {
  const propertyId = requireNumber(params, "propertyId");
  const property = await store.getProperty(propertyId);
  if (!property) {
    return { ok: false, message: `No property found with id ${propertyId}.` };
  }
  return {
    ok: true,
    message: `Property ${property.propertyId} — ${property.name} (${property.status}), managed by ${property.manager}. ${property.address}.`,
    data: property,
  };
};

const findPropertyByName: ActionHandler = async (store, params) => {
  const name = requireString(params, "name");
  const property = await store.findPropertyByName(name);
  if (!property) {
    return { ok: false, message: `No property matching "${name}" was found.` };
  }
  return {
    ok: true,
    message: `${property.name} (id ${property.propertyId}) is managed by ${property.manager}. Status: ${property.status}.`,
    data: property,
  };
};

const getPropertyManager: ActionHandler = async (store, params) => {
  const name = requireString(params, "name");
  const property = await store.findPropertyByName(name);
  if (!property) {
    return { ok: false, message: `No property matching "${name}" was found.` };
  }
  return {
    ok: true,
    message: `${property.name} is managed by ${property.manager}.`,
    data: { propertyId: property.propertyId, manager: property.manager },
  };
};

const listOpenMaintenanceTickets: ActionHandler = async (store, params) => {
  const propertyId = params.propertyId !== undefined ? requireNumber(params, "propertyId") : undefined;
  const openOrders = await store.listWorkOrders({ propertyId, status: "Open" });
  if (openOrders.length === 0) {
    return {
      ok: true,
      message: propertyId
        ? `No open maintenance tickets for property ${propertyId}.`
        : "No open maintenance tickets.",
      data: [],
    };
  }
  const lines = openOrders.map(
    (wo) => `#${wo.workOrderId} — ${wo.description} (assigned to ${wo.assignedTo})`,
  );
  return {
    ok: true,
    message: `Open maintenance tickets:\n${lines.join("\n")}`,
    data: openOrders,
  };
};

const getWorkOrderAssignee: ActionHandler = async (store, params) => {
  const workOrderId = requireNumber(params, "workOrderId");
  const workOrder = await store.getWorkOrder(workOrderId);
  if (!workOrder) {
    return { ok: false, message: `No work order found with id ${workOrderId}.` };
  }
  return {
    ok: true,
    message: `Work order #${workOrder.workOrderId} (${workOrder.description}) is assigned to ${workOrder.assignedTo}. Status: ${workOrder.status}.`,
    data: workOrder,
  };
};

/**
 * Phase 1 allowlist. Anything not registered here — including the Phase 2/3
 * action names declared in ActionName — is rejected before it ever reaches
 * a data store. This is the "Gemini never writes directly to storage"
 * boundary from the PRD: the model can only ever request a name from this
 * map, never execute one.
 */
const PHASE_1_ACTIONS: Partial<Record<ActionName, ActionHandler>> = {
  getProperty,
  findPropertyByName,
  getPropertyManager,
  listOpenMaintenanceTickets,
  getWorkOrderAssignee,
};

export async function executeIntent(store: DataStore, intent: Intent): Promise<ActionResult> {
  const handler = PHASE_1_ACTIONS[intent.action];
  if (!handler) {
    return {
      ok: false,
      message: `"${intent.action}" isn't available yet — Phase 1 is read-only.`,
    };
  }
  try {
    return await handler(store, intent.params);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Couldn't complete that request: ${detail}` };
  }
}

export const SUPPORTED_ACTIONS = Object.keys(PHASE_1_ACTIONS) as ActionName[];
