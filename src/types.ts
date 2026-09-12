export interface Property {
  propertyId: number;
  name: string;
  manager: string;
  status: "Active" | "Inactive";
  address: string;
  /**
   * Free-text notes typed by staff, present on some properties and not
   * others. Deliberately unstructured — codes, locations and contract terms
   * are written inconsistently, which is the point: this is what the real
   * export looks like, and reading it is what Gemini is here for.
   */
  keyBoxNotes?: string;
  maintenanceNotes?: string;
}

export interface WorkOrder {
  workOrderId: number;
  propertyId: number;
  description: string;
  status: "Open" | "InProgress" | "Completed";
  assignedTo: string;
  createdAt: string;
}

export interface Vendor {
  vendorId: number;
  name: string;
  phone: string;
  service: string;
}

export interface OperationalDataset {
  properties: Property[];
  workOrders: WorkOrder[];
  vendors: Vendor[];
}

