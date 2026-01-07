export type Role = 'ADMIN' | 'SELLER';
export type CostType = 'BCV' | 'TH';
export type PaymentStatus = 'PAID' | 'PENDING' | 'PARTIAL';
export type SaleStatus = 'COMPLETED' | 'CANCELLED';
export type RifType = 'V' | 'E' | 'J' | 'G' | 'P' | 'C';
export type CurrencyView = 'USD' | 'BS';
export type PaymentCurrency = 'USD' | 'BS'; // <--- NUEVO TIPO

export interface PaymentMethod {
  id: string;
  name: string;
  currency: PaymentCurrency; // <--- NUEVO CAMPO OBLIGATORIO
}

export interface GlobalSettings {
  tasaBCV: number;
  tasaTH: number;
  defaultMargin: number;
  defaultVAT: number;
  lastUpdated: string;
  showMonitorRate: boolean;
  companyName: string;
  rifType: RifType;
  rif: string;
  address: string;
  printerCurrency: CurrencyView;
}

export interface Supplier {
  id: string;
  name: string;
  rif?: string;
  phone?: string;
  catalog: { sku: string; name: string; lastCost: number; }[];
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

export interface IncomingItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  costUnitUSD: number;
  minStock?: number;
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
  paymentMethod: string;
  items: CartItem[];
  status?: SaleStatus;
}

export interface DailyClose {
  id: string;
  date: string;
  totalUSD: number;
  totalByMethod: Record<string, number>;
  totalTickets: number;
  notes?: string;
}