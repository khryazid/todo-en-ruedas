/**
 * @file utils/mappers.ts
 * @description Funciones centralizadas de mapeo DB (snake_case) → JS (camelCase).
 *
 * Antes estos mapeos estaban duplicados en authSlice, saleSlice,
 * invoiceSlice, productSlice y clientSlice.
 */

import type {
  Product, Client, Sale, Invoice, PaymentMethod, Supplier,
} from '../types';

// ─── Productos ──────────────────────────────────────────────────────────────

export const mapProductFromDB = (p: Record<string, unknown>): Product => ({
  id: p.id as string,
  sku: p.sku as string,
  name: p.name as string,
  category: (p.category as string) || 'General',
  stock: Number(p.stock) || 0,
  minStock: Number(p.min_stock) || 0,
  cost: Number(p.cost) || 0,
  costType: (p.cost_type as Product['costType']) || 'BCV',
  freight: Number(p.freight) || 0,
  supplier: (p.supplier as string) || 'General',
});

// ─── Clientes ───────────────────────────────────────────────────────────────

export const mapClientFromDB = (c: Record<string, unknown>): Client => ({
  id: c.id as string,
  name: c.name as string,
  rif: c.rif as string,
  phone: (c.phone as string) ?? undefined,
  address: (c.address as string) ?? undefined,
  email: (c.email as string) ?? undefined,
  notes: (c.notes as string) ?? undefined,
  creditLimit: c.credit_limit ? Number(c.credit_limit) : undefined,
  priceList: (c.price_list as Client['priceList']) ?? undefined,
  creditBalance: c.credit_balance ? Number(c.credit_balance) : 0,
});

// ─── Ventas ─────────────────────────────────────────────────────────────────

export const mapSaleFromDB = (s: Record<string, unknown>): Sale => ({
  id: s.id as string,
  localId: s.local_id as number | undefined,
  date: s.date as string,
  clientId: (s.client_id as string) || undefined,
  totalUSD: s.total_usd as number,
  totalVED: s.total_ved as number,
  paymentMethod: s.payment_method as string,
  status: s.status as Sale['status'],
  paidAmountUSD: s.paid_amount_usd as number,
  isCredit: (s.is_credit as boolean) || false,
  userId: (s.user_id as string) || undefined,
  sellerName: (s.seller_name as string) || undefined,
  items: ((s.sale_items as Record<string, unknown>[]) || []).map((i) => ({
    sku: (i.sku as string) || 'N/A',
    name: (i.product_name_snapshot as string) || 'Producto',
    quantity: i.quantity as number,
    priceFinalUSD: i.unit_price_usd as number,
    costUnitUSD: i.cost_unit_usd as number,
  })),
  payments: ((s.payments as Record<string, unknown>[]) || []).map((p) => ({
    id: p.id as string,
    date: p.created_at as string,
    amountUSD: p.amount_usd as number,
    method: p.method as string,
    note: p.note as string | undefined,
  })),
});

// ─── Facturas ───────────────────────────────────────────────────────────────

export const mapInvoiceFromDB = (
  inv: Record<string, unknown>,
  suppliers: Array<{ id: string; name: string }>,
): Invoice => ({
  ...(inv as unknown as Invoice),
  supplier: suppliers.find((s) => s.id === inv.supplier)?.name || (inv.supplier as string),
  subtotalUSD: inv.subtotal_usd as number,
  freightTotalUSD: inv.freight_total_usd as number,
  taxTotalUSD: inv.tax_total_usd as number,
  totalUSD: inv.total_usd as number,
  paidAmountUSD: inv.paid_amount_usd as number,
  dateIssue: inv.date_issue as string,
  dateDue: inv.date_due as string,
  payments: (inv.payments as Invoice['payments']) || [],
});

// ─── Métodos de Pago ────────────────────────────────────────────────────────

export const mapPaymentMethodFromDB = (pm: Record<string, unknown>): PaymentMethod => ({
  id: pm.id as string,
  name: pm.name as string,
  currency: pm.currency as PaymentMethod['currency'],
  commissionPct: Number(pm.commission_pct) || 0,
});

// ─── Proveedores ────────────────────────────────────────────────────────────

export const mapSupplierFromDB = (s: Record<string, unknown>): Supplier => ({
  id: s.id as string,
  name: s.name as string,
  rif: (s.rif as string) ?? undefined,
  rifType: (s.rif_type as Supplier['rifType']) ?? undefined,
  contactName: (s.contact_name as string) ?? undefined,
  phone: (s.phone as string) ?? undefined,
  email: (s.email as string) ?? undefined,
  address: (s.address as string) ?? undefined,
  category: (s.category as Supplier['category']) ?? undefined,
  notes: (s.notes as string) ?? undefined,
  createdAt: (s.created_at as string) ?? undefined,
});
