/**
 * @file index.ts
 * @description Definiciones de Tipos Globales.
 * Incluye todos los modelos de datos y la interfaz AppSettings que faltaba.
 */

// --- TIPOS BÁSICOS ---
export type PaymentMethodType = 'USD' | 'BS';
export type CostType = 'BCV' | 'TH';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID';
export type SaleStatus = 'COMPLETED' | 'CANCELLED' | 'PENDING' | 'PARTIAL';
export type Role = 'ADMIN' | 'SELLER';
export type RifType = 'J' | 'V' | 'E' | 'G' | 'P' | 'C';
export type CurrencyView = 'USD' | 'BS';
export type PaymentCurrency = 'USD' | 'BS';

// --- INTERFACES DE NEGOCIO ---

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  cost: number;
  freight?: number;
  costType: CostType;
  supplier?: string;
  customMargin?: number;
  customVAT?: number;
}

export interface Client {
  id: string;
  name: string;
  rif: string;
  phone?: string;
  address?: string;
  email?: string;
  notes?: string;
}

export interface CartItem extends Product {
  quantity: number;
  priceFinalUSD: number;
}

export interface SaleItem {
  sku: string;
  name: string;
  quantity: number;
  priceFinalUSD: number;
  costUnitUSD: number;
}

export interface Payment {
  id: string;
  date: string;
  amountUSD: number;
  method: string;
  note?: string;
}

export interface Sale {
  id: string;
  date: string;
  totalUSD: number;
  totalVED: number;
  paymentMethod: string;
  items: SaleItem[];
  status: SaleStatus;
  clientId?: string;
  paidAmountUSD: number;
  payments: Payment[];
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  catalog: { sku: string; name: string; lastCost: number }[];
}

export interface IncomingItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  costUnitUSD: number;
  minStock: number;
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
  initialPayment?: number;
}

export interface PaymentMethod {
  id: string;
  name: string;
  currency: PaymentCurrency;
}

// --- ESTA ES LA INTERFAZ QUE FALTABA ---
export interface AppSettings {
  companyName: string;
  rif: string;
  rifType: RifType;
  address: string;
  tasaBCV: number;
  tasaTH: number;
  showMonitorRate: boolean;
  lastUpdated: string;
  defaultMargin: number;
  defaultVAT: number;
  printerCurrency: CurrencyView;
}