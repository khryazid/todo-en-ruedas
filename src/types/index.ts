/**
 * @file index.ts
 * @description Definiciones de tipos e interfaces globales para el sistema 'Todo en Ruedas'.
 * Define la estructura de datos para Productos, Ventas, Facturas y Configuración.
 */

// --- ENUMS & UNION TYPES ---
export type Role = 'ADMIN' | 'SELLER';
export type CostType = 'BCV' | 'TH'; // Tasa Oficial vs Paralelo
export type PaymentStatus = 'PAID' | 'PENDING' | 'PARTIAL';
export type SaleStatus = 'COMPLETED' | 'CANCELLED';
export type RifType = 'V' | 'E' | 'J' | 'G' | 'P' | 'C';
export type CurrencyView = 'USD' | 'BS';
export type PaymentCurrency = 'USD' | 'BS';

/**
 * Representa un método de pago disponible en el sistema (ej: Zelle, Punto de Venta).
 */
export interface PaymentMethod {
  id: string;
  name: string;
  currency: PaymentCurrency;
}

/**
 * Configuración global de la aplicación.
 * Se persiste en LocalStorage.
 */
export interface GlobalSettings {
  tasaBCV: number;
  tasaTH: number;
  defaultMargin: number; // Margen de ganancia por defecto (%)
  defaultVAT: number;    // IVA por defecto (%)
  lastUpdated: string;   // ISO Date
  showMonitorRate: boolean;
  companyName: string;
  rifType: RifType;
  rif: string;
  address: string;
  printerCurrency: CurrencyView; // Moneda principal en tickets
}

/**
 * Proveedor de mercancía.
 */
export interface Supplier {
  id: string;
  name: string;
  rif?: string;
  phone?: string;
  /** Catálogo histórico de productos comprados a este proveedor */
  catalog: { sku: string; name: string; lastCost: number; }[];
}

/**
 * Producto en Inventario.
 */
export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;      // Alerta de stock bajo
  cost: number;          // Costo unitario en Divisa
  freight: number;       // Flete unitario prorrateado
  costType: CostType;    // Qué tasa se usó para comprarlo
  supplier?: string;
  customMargin?: number; // Si se define, anula el default
  customVAT?: number;    // Si se define, anula el default
}

/**
 * Ítem dentro de una Factura de Compra (Entrada de mercancía).
 */
export interface IncomingItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  costUnitUSD: number;
  minStock?: number;
}

/**
 * Registro de un pago parcial o total a una factura.
 */
export interface Payment {
  id: string;
  date: string;
  amountUSD: number;
  method: string;
  note?: string;
}

/**
 * Factura de Compra (Cuentas por Pagar).
 */
export interface Invoice {
  id: string;
  number: string;        // Número de control físico
  supplier: string;
  dateIssue: string;     // Fecha emisión
  dateDue: string;       // Fecha vencimiento
  status: PaymentStatus;
  costType: CostType;
  items: IncomingItem[];
  subtotalUSD: number;
  freightTotalUSD: number; // Flete global de la factura
  totalUSD: number;
  paidAmountUSD: number;   // Cuánto se ha abonado
  payments: Payment[];     // Historial de abonos
}

/**
 * Ítem en el Carrito de Ventas (Extiende de Product agregando cantidad y precios finales).
 */
export interface CartItem extends Product {
  quantity: number;
  priceBaseUSD: number; // Precio sin IVA
  priceTaxUSD: number;  // Monto del IVA
  priceFinalUSD: number;// Precio Final (PVP)
}

/**
 * Venta realizada (Ticket).
 */
export interface Sale {
  id: string;
  date: string;
  totalUSD: number;
  totalVED: number;     // Guardamos el total en Bs al momento de la venta (histórico)
  paymentMethod: string;
  items: CartItem[];
  status?: SaleStatus;
}

/**
 * Cierre de Caja Diario (Reporte Z).
 */
export interface DailyClose {
  id: string;
  date: string;
  totalUSD: number;
  totalByMethod: Record<string, number>;
  totalTickets: number;
  notes?: string;
}