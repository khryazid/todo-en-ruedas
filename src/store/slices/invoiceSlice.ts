/**
 * @file slices/invoiceSlice.ts
 * @description CRUD de facturas de compra y abonos a proveedores.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { Invoice, Payment } from '../../types';

export const createInvoiceSlice = (set: any, get: any) => ({

  invoices: [] as Invoice[],
  suppliers: [] as any[],

  addInvoice: async (invoice: Invoice) => {
    const loadingToast = toast.loading("Registrando factura...");
    try {
      const { error } = await supabase.from('invoices').insert({
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
      });

      if (error) throw error;

      const totalItemsQuantity = invoice.items.reduce((acc: number, item: any) => acc + item.quantity, 0);
      const unitFreight = totalItemsQuantity > 0
        ? Math.round((invoice.freightTotalUSD / totalItemsQuantity) * 100) / 100
        : 0;

      for (const item of invoice.items) {
        const existing = get().products.find((p: any) => p.sku === item.sku);
        if (existing) {
          await supabase.from('products').update({
            stock: Number(existing.stock) + Number(item.quantity),
            cost: item.costUnitUSD,
            cost_type: invoice.costType,
            freight: unitFreight
          }).eq('id', existing.id);
        } else {
          await supabase.from('products').insert({
            sku: item.sku,
            name: item.name,
            stock: Number(item.quantity),
            cost: item.costUnitUSD,
            min_stock: item.minStock,
            category: 'General',
            cost_type: invoice.costType,
            supplier: invoice.supplier,
            freight: unitFreight
          });
        }
      }

      const existingSupplier = get().suppliers.find((s: any) => s.name.toLowerCase() === invoice.supplier.toLowerCase());
      const newCatalogItems = invoice.items.map((item: any) => ({
        sku: item.sku, name: item.name, lastCost: item.costUnitUSD
      }));

      if (existingSupplier) {
        const mergedCatalog = [...(existingSupplier.catalog || [])];
        newCatalogItems.forEach((newItem: any) => {
          const idx = mergedCatalog.findIndex((c: any) => c.sku === newItem.sku);
          if (idx >= 0) mergedCatalog[idx] = newItem;
          else mergedCatalog.push(newItem);
        });
        await supabase.from('suppliers').update({ catalog: mergedCatalog }).eq('id', existingSupplier.id);
      } else {
        await supabase.from('suppliers').insert({ name: invoice.supplier, catalog: newCatalogItems });
      }

      toast.dismiss(loadingToast);
      toast.success("Factura y Stock actualizados 📦");
      get().fetchInitialData();
      return true;

    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error("Error al registrar: " + error.message);
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

      set((state: any) => ({ invoices: state.invoices.map((i: any) => i.id === invoice.id ? invoice : i) }));
      toast.dismiss(loadingToast);
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error("Error al actualizar factura: " + error.message);
    }
  },

  deleteInvoice: async (id: string) => {
    const loadingToast = toast.loading("Eliminando factura...");
    try {
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) throw error;

      set((state: any) => ({ invoices: state.invoices.filter((i: any) => i.id !== id) }));
      toast.dismiss(loadingToast);
      toast.success("Factura eliminada 🗑️");
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error("Error al eliminar: " + error.message);
    }
  },

  registerPayment: async (invoiceId: string, payment: Payment) => {
    const loadingToast = toast.loading("Registrando pago...");
    try {
      const invoice = get().invoices.find((i: any) => i.id === invoiceId);
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

      set((state: any) => ({
        invoices: state.invoices.map((i: any) =>
          i.id === invoiceId
            ? { ...i, paidAmountUSD: newPaidAmount, status: newStatus, payments: newPayments }
            : i
        )
      }));

      toast.dismiss(loadingToast);
      toast.success("Abono registrado con éxito");
      get().fetchInitialData();
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error("Error al registrar pago: " + error.message);
    }
  },
});
