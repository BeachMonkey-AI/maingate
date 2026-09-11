export interface Property {
  propertyId: number;
  name: string;
  manager: string;
  status: "Active" | "Inactive";
  address: string;
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

/**
 * The full set of actions the assistant may take. Phase 1 ships only the
 * read-only ones; Phase 2 write actions are declared here (as a contract)
 * but rejected by the action registry until implemented.
 */
export type ActionName =
  | "getProperty"
  | "findPropertyByName"
  | "getPropertyManager"
  | "listOpenMaintenanceTickets"
  | "getWorkOrderAssignee"
  | "updateWorkOrderStatus" // Phase 2
  | "updateVendorPhone"; // Phase 2

export interface Intent {
  action: ActionName;
  params: Record<string, string | number>;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  data?: unknown;
}
