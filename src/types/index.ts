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
export type ReturnType = 'PARTIAL' | 'FULL';
export type UserRole = 'ADMIN' | 'MANAGER' | 'SELLER' | 'VIEWER';
export type Role = UserRole;
export type RifType = 'J' | 'V' | 'E' | 'G' | 'P' | 'C';
export type CurrencyView = 'USD' | 'BS';
export type PaymentCurrency = 'USD' | 'BS';
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'CANCEL' | 'LOGIN' | 'LOGOUT';

export interface SaleReturn {
  id: string;
  saleId: string;
  date: string;
  reason?: string;
  refundAmountUSD: number;
  type: ReturnType;
  userId?: string;
  sellerName?: string;
  items: { productId?: string; sku: string; name: string; quantity: number; priceUSD: number }[];
}

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
  creditLimit?: number; // #2 Límite de crédito
}

// ─── GASTOS ───────────────────────────────────────────────────────────────────
// Las categorías base. El usuario puede escribir cualquier texto libre también.
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Operativo', 'Nómina', 'Servicios', 'Transporte',
  'Alquiler', 'Luz', 'Agua', 'Internet', 'Seguro', 'Otro'
] as const;

export type ExpenseCategory = typeof DEFAULT_EXPENSE_CATEGORIES[number] | string;

export type ExpenseCurrency = 'USD' | 'BS';

export interface Expense {
  id: string;
  date: string;           // ISO date yyyy-mm-dd
  description: string;
  amountUSD: number;      // Siempre almacenado en USD (conversión si es BS)
  amountBS?: number;      // Monto original en bolívares (si currency=BS)
  currency: ExpenseCurrency; // Moneda de ingreso
  category: ExpenseCategory;
  paymentMethod: string;
  userId?: string;
  sellerName?: string;
  // Gastos recurrentes
  isRecurring?: boolean;
  recurringId?: string;   // ID de la plantilla recurrente a la que pertenece
}

export interface RecurringExpense {
  id: string;
  description: string;
  category: ExpenseCategory;
  amountUSD: number;
  amountBS?: number;
  currency: ExpenseCurrency;
  paymentMethod: string;
  dayOfMonth?: number;    // día del mes para recordatorio (1-31)
  active: boolean;
}


export interface CartItem extends Product {
  quantity: number;
  priceFinalUSD: number;
}

// ─── COTIZACIONES ────────────────────────────────────────────────────────────
export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface QuoteItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  priceFinalUSD: number;  // precio de lista
  discountPct?: number;   // descuento por ítem 0-100
}

export interface Quote {
  id: string;
  number: string;
  date: string;
  validUntil: string;
  clientId?: string;
  clientName?: string;
  items: QuoteItem[];
  totalUSD: number;
  totalBs: number;
  notes?: string;
  status: QuoteStatus;
  userId?: string;
  sellerName?: string;
}
// ─────────────────────────────────────────────────────────────────────────────

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
  localId?: number;
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
  taxTotalUSD: number;
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
  shiftStart?: string;  // Hora de apertura del turno, formato "HH:MM" (ej: "08:00")
  showSellerCommission?: boolean; // Mostrar tarjeta comisión en Dashboard del SELLER
  sellerCommissionPct?: number;   // Porcentaje de comisión (default 5)
  companyLogo?: string; // URL del logo personalizado
  brandColor?: string;  // Color de marca personalizado
}

export interface CashClose {
  id: string;
  sequenceNumber?: number;
  closedAt: string;
  closedBy?: string;
  sellerName?: string;
  totalUSD: number;
  totalBs: number;
  txCount: number;
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
