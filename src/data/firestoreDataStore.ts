import { Firestore } from "@google-cloud/firestore";
import type { Property, Vendor, WorkOrder } from "../types.js";
import type { DataStore, WorkOrderFilter } from "./store.js";

/**
 * Phase 2 target store. Not wired up by default (no GCP project/credentials
 * are available in the environment this was built in) and not covered by
 * the test suite — treat as a documented starting point, not verified code.
 * Swap in via DATA_STORE=firestore once a Firestore instance is seeded with
 * `properties`, `workOrders`, and `vendors` collections shaped like
 * data/sample-data.json.
 */
export class FirestoreDataStore implements DataStore {
  private readonly db: Firestore;

  constructor(projectId?: string) {
    this.db = new Firestore(projectId ? { projectId } : undefined);
  }

  async listProperties(): Promise<Property[]> {
    const snap = await this.db.collection("properties").get();
    return snap.docs.map((d) => d.data() as Property);
  }

  async getProperty(propertyId: number): Promise<Property | null> {
    const doc = await this.db.collection("properties").doc(String(propertyId)).get();
    return doc.exists ? (doc.data() as Property) : null;
  }

  async findPropertyByName(name: string): Promise<Property | null> {
    const needle = name.trim().toLowerCase();
    const properties = await this.listProperties();
    return (
      properties.find((p) => p.name.toLowerCase() === needle) ??
      properties.find((p) => p.name.toLowerCase().includes(needle)) ??
      null
    );
  }

  async listWorkOrders(filter: WorkOrderFilter = {}): Promise<WorkOrder[]> {
    let query: FirebaseFirestore.Query = this.db.collection("workOrders");
    if (filter.propertyId !== undefined) {
      query = query.where("propertyId", "==", filter.propertyId);
    }
    if (filter.status !== undefined) {
      query = query.where("status", "==", filter.status);
    }
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as WorkOrder);
  }

  async getWorkOrder(workOrderId: number): Promise<WorkOrder | null> {
    const doc = await this.db.collection("workOrders").doc(String(workOrderId)).get();
    return doc.exists ? (doc.data() as WorkOrder) : null;
  }

  async getVendor(vendorId: number): Promise<Vendor | null> {
    const doc = await this.db.collection("vendors").doc(String(vendorId)).get();
    return doc.exists ? (doc.data() as Vendor) : null;
  }
}
