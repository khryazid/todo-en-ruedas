/**
 * @file index.ts
 * @description Definiciones de Tipos Globales.
 * Única fuente de verdad para todos los tipos del sistema.
 *
 * ✅ SPRINT 3 FIXES:
 *   3.1 — Este es el ÚNICO archivo de tipos (eliminar src/index.ts duplicado)
 *   3.3 — Agregado isCredit en Sale
 */

// --- TIPOS BÁSICOS ---
export type PaymentMethodType = 'USD' | 'BS';
export type CostType = 'BCV' | 'TH';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID';
export type SaleStatus = 'COMPLETED' | 'CANCELLED' | 'PENDING' | 'PARTIAL';
export type UserRole = 'ADMIN' | 'MANAGER' | 'SELLER' | 'VIEWER';
export type Role = UserRole; // Mantener compatibilidad
export type RifType = 'J' | 'V' | 'E' | 'G' | 'P' | 'C';
export type CurrencyView = 'USD' | 'BS';
export type PaymentCurrency = 'USD' | 'BS';
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'CANCEL' | 'LOGIN' | 'LOGOUT';

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
  isCredit: boolean; // ✅ FIX 3.3: Flag explícito para ventas a crédito
  userId?: string;      // ✅ FIX: ID del usuario que realizó la venta
  sellerName?: string;  // ✅ FIX: Snapshot del nombre del vendedor
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
  lastCloseDate?: string;
  companyLogo?: string; // URL del logo personalizado
  brandColor?: string; // Color de marca personalizado
}

// --- SISTEMA DE USUARIOS ---

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
}

export interface Permission {
  canCreateSales: boolean;
  canCancelSales: boolean;
  canManageInventory: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canEditSettings: boolean;
  canManageInvoices: boolean;
  canViewAuditLogs: boolean;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

// Mapeo de roles a permisos
export const ROLE_PERMISSIONS: Record<UserRole, Permission> = {
  ADMIN: {
    canCreateSales: true,
    canCancelSales: true,
    canManageInventory: true,
    canViewReports: true,
    canManageUsers: true,
    canEditSettings: true,
    canManageInvoices: true,
    canViewAuditLogs: true,
  },
  MANAGER: {
    canCreateSales: true,
    canCancelSales: true,
    canManageInventory: true,
    canViewReports: true,
    canManageUsers: false,
    canEditSettings: true,
    canManageInvoices: true,
    canViewAuditLogs: false,
  },
  SELLER: {
    canCreateSales: true,
    canCancelSales: false,
    canManageInventory: false,
    canViewReports: true,
    canManageUsers: false,
    canEditSettings: false,
    canManageInvoices: false,
    canViewAuditLogs: false,
  },
  VIEWER: {
    canCreateSales: false,
    canCancelSales: false,
    canManageInventory: false,
    canViewReports: true,
    canManageUsers: false,
    canEditSettings: false,
    canManageInvoices: false,
    canViewAuditLogs: false,
  },
};
