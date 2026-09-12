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

