import type { Property, WorkOrder, Vendor } from "../types.js";

export interface WorkOrderFilter {
  propertyId?: number;
  status?: WorkOrder["status"];
}

/**
 * Storage-agnostic contract. Phase 1 ships JsonDataStore; a Firestore-backed
 * implementation can substitute in without touching actions or the webhook.
 */
export interface DataStore {
  listProperties(): Promise<Property[]>;
  getProperty(propertyId: number): Promise<Property | null>;
  findPropertyByName(name: string): Promise<Property | null>;
  listWorkOrders(filter?: WorkOrderFilter): Promise<WorkOrder[]>;
  getWorkOrder(workOrderId: number): Promise<WorkOrder | null>;
  getVendor(vendorId: number): Promise<Vendor | null>;
}
