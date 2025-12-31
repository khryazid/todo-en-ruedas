export type Role = 'ADMIN' | 'SELLER';
export type CostType = 'BCV' | 'TH';
export type PaymentStatus = 'PAID' | 'PENDING' | 'PARTIAL';

export interface GlobalSettings {
  tasaBCV: number;
  tasaTH: number;
  defaultMargin: number;
  defaultVAT: number;
  lastUpdated: string;
  showMonitorRate: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  rif?: string;
  phone?: string;
  catalog: {
    sku: string;
    name: string;
    lastCost: number;
  }[];
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  cost: number;
  freight: number;
  costType: CostType;
  supplier?: string;
  customMargin?: number;
  customVAT?: number;
}

// --- ACTUALIZADO: AHORA ACEPTA MINSTOCK ---
export interface IncomingItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  costUnitUSD: number;
  minStock?: number; // Opcional
}

export interface Payment {
  id: string;
  date: string;
  amountUSD: number;
  method: string;
  note?: string;
}

export interface Invoice {
  id: string;
  number: string;
  supplier: string;
  dateIssue: string;
  dateDue: string;
  status: PaymentStatus;
  costType: CostType;
  items: IncomingItem[];
  subtotalUSD: number;
  freightTotalUSD: number;
  totalUSD: number;
  paidAmountUSD: number;
  payments: Payment[];
}

export interface CartItem extends Product {
  quantity: number;
  priceBaseUSD: number;
  priceTaxUSD: number;
  priceFinalUSD: number;
}

export interface Sale {
  id: string;
  date: string;
  totalUSD: number;
  totalVED: number;
  items: CartItem[];
}