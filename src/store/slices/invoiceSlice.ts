/**
 * @file slices/invoiceSlice.ts
 * @description CRUD de facturas de compra y abonos a proveedores.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { Invoice, Payment, Supplier, Product } from '../../types';
import type { SetState, GetState } from '../types';

export const createInvoiceSlice = (set: SetState, get: GetState) => ({

  invoices: [] as Invoice[],
  suppliers: [] as Supplier[],

  addInvoice: async (invoice: Invoice) => {
    const loadingToast = toast.loading("Registrando factura...");
    try {
      const { data: invoiceData, error } = await supabase.from('invoices').insert({
        number: invoice.number,
        supplier: invoice.supplier,
        date_issue: invoice.dateIssue,
        date_due: invoice.dateDue,
        status: invoice.status,
        cost_type: invoice.costType,
        items: invoice.items,
        subtotal_usd: invoice.subtotalUSD,
        freight_total_usd: invoice.freightTotalUSD,
        total_usd: invoice.totalUSD,
        paid_amount_usd: invoice.paidAmountUSD,
        payments: invoice.payments || []
      }).select().single();

      if (error) throw error;

      const totalItemsQuantity = invoice.items.reduce((acc, item) => acc + item.quantity, 0);
      const unitFreight = totalItemsQuantity > 0
        ? Math.round((invoice.freightTotalUSD / totalItemsQuantity) * 100) / 100
        : 0;

      // Track product updates for incremental state update
      const updatedProducts: Map<string, Partial<Product> & { id: string }> = new Map();
      const newProducts: Product[] = [];

      for (const item of invoice.items) {
        const existing = get().products.find((p) => p.sku === item.sku);
        if (existing) {
          await supabase.from('products').update({
            stock: Number(existing.stock) + Number(item.quantity),
            cost: item.costUnitUSD,
            cost_type: invoice.costType,
            freight: unitFreight
          }).eq('id', existing.id);

          updatedProducts.set(existing.id, {
            id: existing.id,
            stock: Number(existing.stock) + Number(item.quantity),
            cost: item.costUnitUSD,
            costType: invoice.costType,
            freight: unitFreight
          });
        } else {
          const { data: newProdData } = await supabase.from('products').insert({
            sku: item.sku,
            name: item.name,
            stock: Number(item.quantity),
            cost: item.costUnitUSD,
            min_stock: item.minStock,
            category: 'General',
            cost_type: invoice.costType,
            supplier: invoice.supplier,
            freight: unitFreight
          }).select().single();

          if (newProdData) {
            newProducts.push({
              id: newProdData.id,
              sku: item.sku,
              name: item.name,
              stock: Number(item.quantity),
              cost: item.costUnitUSD,
              minStock: item.minStock,
              category: 'General',
              costType: invoice.costType,
              supplier: invoice.supplier,
              freight: unitFreight
            });
          }
        }
      }

      const existingSupplier = get().suppliers.find((s) => s.name.toLowerCase() === invoice.supplier.toLowerCase());
      const newCatalogItems = invoice.items.map((item) => ({
        sku: item.sku, name: item.name, lastCost: item.costUnitUSD
      }));

      let updatedSuppliers = get().suppliers;
      if (existingSupplier) {
        const mergedCatalog = [...(existingSupplier.catalog || [])];
        newCatalogItems.forEach((newItem) => {
          const idx = mergedCatalog.findIndex((c) => c.sku === newItem.sku);
          if (idx >= 0) mergedCatalog[idx] = newItem;
          else mergedCatalog.push(newItem);
        });
        await supabase.from('suppliers').update({ catalog: mergedCatalog }).eq('id', existingSupplier.id);
        updatedSuppliers = updatedSuppliers.map((s) =>
          s.id === existingSupplier.id ? { ...s, catalog: mergedCatalog } : s
        );
      } else {
        const { data: newSupplierData } = await supabase.from('suppliers').insert({ name: invoice.supplier, catalog: newCatalogItems }).select().single();
        if (newSupplierData) {
          updatedSuppliers = [...updatedSuppliers, { id: newSupplierData.id, name: invoice.supplier, catalog: newCatalogItems }];
        }
      }

      // Incremental update: add invoice, update products and suppliers locally
      const savedInvoice: Invoice = invoiceData ? { ...invoice, id: invoiceData.id } : invoice;
      set((state) => ({
        invoices: [...state.invoices, savedInvoice],
        products: [
          ...state.products.map((p) => {
            const update = updatedProducts.get(p.id);
            if (update) return { ...p, ...update };
            return p;
          }),
          ...newProducts
        ],
        suppliers: updatedSuppliers
      }));

      toast.dismiss(loadingToast);
      toast.success("Factura y Stock actualizados 📦");
      return true;

    } catch (error: unknown) {
      toast.dismiss(loadingToast);
      toast.error("Error al registrar: " + (error as Error).message);
      return false;
    }
  },

  updateInvoice: async (invoice: Invoice) => {
    const loadingToast = toast.loading("Actualizando factura...");
    try {
      const { error } = await supabase.from('invoices').update({
        number: invoice.number,
        supplier: invoice.supplier,
        date_due: invoice.dateDue,
        status: invoice.status,
        items: invoice.items,
        subtotal_usd: invoice.subtotalUSD,
        freight_total_usd: invoice.freightTotalUSD,
        total_usd: invoice.totalUSD,
        paid_amount_usd: invoice.paidAmountUSD,
        payments: invoice.payments
      }).eq('id', invoice.id);

      if (error) throw error;

      set((state) => ({ invoices: state.invoices.map((i) => i.id === invoice.id ? invoice : i) }));
      toast.dismiss(loadingToast);
    } catch (error: unknown) {
      toast.dismiss(loadingToast);
      toast.error("Error al actualizar factura: " + (error as Error).message);
    }
  },

  deleteInvoice: async (id: string) => {
    const loadingToast = toast.loading("Eliminando factura...");
    try {
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) throw error;

      set((state) => ({ invoices: state.invoices.filter((i) => i.id !== id) }));
      toast.dismiss(loadingToast);
      toast.success("Factura eliminada 🗑️");
    } catch (error: unknown) {
      toast.dismiss(loadingToast);
      toast.error("Error al eliminar: " + (error as Error).message);
    }
  },

  registerPayment: async (invoiceId: string, payment: Payment) => {
    const loadingToast = toast.loading("Registrando pago...");
    try {
      const invoice = get().invoices.find((i) => i.id === invoiceId);
      if (!invoice) throw new Error("Factura no encontrada");

      const newPaidAmount = invoice.paidAmountUSD + payment.amountUSD;
      const newPayments = [...(invoice.payments || []), payment];

      let newStatus = invoice.status;
      if (newPaidAmount >= invoice.totalUSD - 0.01) newStatus = 'PAID';
      else if (newPaidAmount > 0) newStatus = 'PARTIAL';

      const { error } = await supabase.from('invoices').update({
        paid_amount_usd: newPaidAmount,
        status: newStatus,
        payments: newPayments
      }).eq('id', invoiceId);

      if (error) throw error;

      set((state) => ({
        invoices: state.invoices.map((i) =>
          i.id === invoiceId
            ? { ...i, paidAmountUSD: newPaidAmount, status: newStatus, payments: newPayments }
            : i
        )
      }));

      toast.dismiss(loadingToast);
      toast.success("Abono registrado con éxito");
    } catch (error: unknown) {
      toast.dismiss(loadingToast);
      toast.error("Error al registrar pago: " + (error as Error).message);
    }
  },
});
