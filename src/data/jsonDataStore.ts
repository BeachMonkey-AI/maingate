import { readFile } from "node:fs/promises";
import type { OperationalDataset, Property, Vendor, WorkOrder } from "../types.js";
import type { DataStore, WorkOrderFilter } from "./store.js";

/**
 * Loads the operational dataset once from a JSON file and serves it from
 * memory. This is the Phase 1 store — the PRD's "JSON export" path. It is
 * intentionally read-only: Phase 2 write actions go through a store that
 * persists changes (Firestore), not this one.
 */
export class JsonDataStore implements DataStore {
  private dataset: OperationalDataset | null = null;

  constructor(private readonly filePath: string) {}

  private async load(): Promise<OperationalDataset> {
    if (!this.dataset) {
      const raw = await readFile(this.filePath, "utf-8");
      this.dataset = JSON.parse(raw) as OperationalDataset;
    }
    return this.dataset;
  }

  async listProperties(): Promise<Property[]> {
    const { properties } = await this.load();
    return properties;
  }

  async getProperty(propertyId: number): Promise<Property | null> {
    const { properties } = await this.load();
    return properties.find((p) => p.propertyId === propertyId) ?? null;
  }

  async findPropertyByName(name: string): Promise<Property | null> {
    const { properties } = await this.load();
    const needle = name.trim().toLowerCase();
    return (
      properties.find((p) => p.name.toLowerCase() === needle) ??
      properties.find((p) => p.name.toLowerCase().includes(needle)) ??
      null
    );
  }

  async listWorkOrders(filter: WorkOrderFilter = {}): Promise<WorkOrder[]> {
    const { workOrders } = await this.load();
    return workOrders.filter(
      (wo) =>
        (filter.propertyId === undefined || wo.propertyId === filter.propertyId) &&
        (filter.status === undefined || wo.status === filter.status),
    );
  }

  async getWorkOrder(workOrderId: number): Promise<WorkOrder | null> {
    const { workOrders } = await this.load();
    return workOrders.find((wo) => wo.workOrderId === workOrderId) ?? null;
  }

  async getVendor(vendorId: number): Promise<Vendor | null> {
    const { vendors } = await this.load();
    return vendors.find((v) => v.vendorId === vendorId) ?? null;
  }
}
