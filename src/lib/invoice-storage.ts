// Types + built-in catalog + helpers. Persistence lives in src/lib/cloud-storage.ts.
import { BUSINESS } from "./business";

export type ServiceLine = {
  id: string;
  name: string;
  unit: string;
  rate: number;
  qty: number;
  description?: string;
};

export type Invoice = {
  id: string;
  invoiceNo: number; // 0 = not yet allocated (saved server-side on finalize)
  customerName: string;
  eventDate: string;
  phone?: string;
  address?: string;
  lines: ServiceLine[];
  discount: number;
  tax: number;
  total: number;
  advancePaid?: number;
  dueAmount?: number;
  notes?: string;
  createdAt: string;
  deletedAt?: string | null;
};

export type PresetItem = Omit<ServiceLine, "id" | "qty"> & {
  id?: string;
  itemType?: "service" | "product";
};

export const BUILTIN_SERVICES: PresetItem[] = [
  { name: "Box Setup (2 Box)", unit: "set", rate: 1200, itemType: "service" },
  { name: "Chair", unit: "per piece", rate: 5, itemType: "service" },
  { name: "Table", unit: "per piece", rate: 50, itemType: "service" },
  { name: "Tent 15x15", unit: "fixed", rate: 600, itemType: "service" },
  { name: "Generator", unit: "fixed", rate: 500, itemType: "service" },
  { name: "Transport", unit: "fixed", rate: 200, itemType: "service" },
];

export function formatInvoiceNo(n: number, prefix = BUSINESS.invoicePrefix) {
  if (!n) return `#${prefix}—`;
  return `#${prefix}${n}`;
}
