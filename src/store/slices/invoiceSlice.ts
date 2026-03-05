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

  fetchSuppliers: async () => {
    try {
      const { data: suppliersData, error } = await supabase.from('suppliers').select('*');
      if (error) throw error;

      set({
        suppliers: (suppliersData || []).map((s) => ({
          id: s.id,
          name: s.name,
          rif: s.rif ?? undefined,
          rifType: s.rif_type ?? undefined,
          contactName: s.contact_name ?? undefined,
          phone: s.phone ?? undefined,
          email: s.email ?? undefined,
          address: s.address ?? undefined,
          category: s.category ?? undefined,
          notes: s.notes ?? undefined,
          createdAt: s.created_at ?? undefined,
        }))
      });
    } catch (error) {
      console.warn('fetchSuppliers realtime sync:', error);
    }
  },

  fetchInvoices: async () => {
    try {
      const { data: invoicesData, error } = await supabase.from('invoices').select('*');
      if (error) throw error;

      const suppliers = get().suppliers;

      set({
        invoices: (invoicesData || []).map((inv) => ({
          ...inv,
          supplier: suppliers.find((s) => s.id === inv.supplier)?.name || inv.supplier,
          subtotalUSD: inv.subtotal_usd,
          freightTotalUSD: inv.freight_total_usd,
          totalUSD: inv.total_usd,
          paidAmountUSD: inv.paid_amount_usd,
          dateIssue: inv.date_issue,
          dateDue: inv.date_due,
          payments: inv.payments || []
        }))
      });
    } catch (error) {
      console.warn('fetchInvoices realtime sync:', error);
    }
  },

  addInvoice: async (invoice: Invoice) => {
    const loadingToast = toast.loading("Registrando factura...");
    try {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const normalize = (value: string) => value.trim().toLowerCase();
      const suppliers = get().suppliers;
      const supplierById = suppliers.find((s) => s.id === invoice.supplier);
      const supplierByName = suppliers.find((s) => normalize(s.name) === normalize(invoice.supplier));

      const supplierId = uuidRegex.test(invoice.supplier)
        ? invoice.supplier
        : supplierByName?.id ?? null;

      let supplierName = supplierById?.name ?? supplierByName?.name ?? invoice.supplier;

      if (supplierId && uuidRegex.test(supplierId) && (!supplierById?.name)) {
        const { data: supplierFromDb } = await supabase
          .from('suppliers')
          .select('name')
          .eq('id', supplierId)
          .maybeSingle();

        if (supplierFromDb?.name) {
          supplierName = supplierFromDb.name;
        }
      }

      const { data: invoiceData, error } = await supabase.from('invoices').insert({
        number: invoice.number,
        supplier: supplierId,
        date_issue: invoice.dateIssue,
        date_due: invoice.dateDue,
        status: invoice.status,
        cost_type: invoice.costType,
        items: invoice.items,
        subtotal_usd: invoice.subtotalUSD,
        freight_total_usd: invoice.freightTotalUSD,
        tax_total_usd: invoice.taxTotalUSD,
        total_usd: invoice.totalUSD,
        paid_amount_usd: invoice.paidAmountUSD,
        payments: invoice.payments || []
      }).select().single();

      if (error) throw error;

      const totalItemsQuantity = invoice.items.reduce((acc, item) => acc + item.quantity, 0);
      const unitFreight = totalItemsQuantity > 0
        ? Math.round((invoice.freightTotalUSD / totalItemsQuantity) * 100) / 100
        : 0;

      const newProducts: Product[] = [];

      for (const item of invoice.items) {
        const existing = get().products.find((p) => p.sku === item.sku);
        if (existing) {
          await get().adjustProductStock(existing.id, Number(item.quantity), {
            cost: item.costUnitUSD,
            costType: invoice.costType,
            freight: unitFreight,
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
            supplier: supplierName,
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
              supplier: supplierName,
              freight: unitFreight
            });
          }
        }
      }

      // Incremental update: add invoice, update products locally
      const savedInvoice: Invoice = invoiceData ? { ...invoice, id: invoiceData.id, supplier: supplierName } : { ...invoice, supplier: supplierName };

      if (savedInvoice.paidAmountUSD > 0) {
        const initialPayment = (savedInvoice.payments || [])[0];
        const paymentMethod = initialPayment?.method || 'Inicial';
        const methodCurrency = get().paymentMethods.find((method) => method.name === paymentMethod)?.currency || 'USD';
        const fxRateUsed = initialPayment?.fxRateUsed || get().settings.tasaBCV;
        const amountBS = methodCurrency === 'BS'
          ? (initialPayment?.amountBS ?? Math.round((savedInvoice.paidAmountUSD * fxRateUsed) * 100) / 100)
          : undefined;

        await get().recordCashMovement({
          date: savedInvoice.dateIssue,
          direction: 'OUT',
          kind: 'ABONO_PROVEEDOR',
          amountUSD: savedInvoice.paidAmountUSD,
          amountBS,
          currency: methodCurrency,
          paymentMethod,
          description: `Abono inicial a proveedor (${supplierName}) · Factura #${savedInvoice.number}`,
          referenceType: 'invoice-payment',
          referenceId: `${savedInvoice.id}:initial`,
          userId: get().currentUserData?.id,
          sellerName: get().currentUserData?.fullName,
        });
      }

      set((state) => {
        const alreadyExists = state.invoices.some((existingInvoice) => existingInvoice.id === savedInvoice.id);
        return {
          invoices: alreadyExists
            ? state.invoices.map((existingInvoice) => existingInvoice.id === savedInvoice.id ? savedInvoice : existingInvoice)
            : [...state.invoices, savedInvoice],
          products: [...state.products, ...newProducts],
        };
      });

      toast.dismiss(loadingToast);
      toast.success("Factura y Stock actualizados 📦");
      return true;

    } catch (error: unknown) {
      toast.dismiss(loadingToast);
      const errorCode = (error as { code?: string })?.code;
      if (errorCode === '23505') {
        toast.error('Ya existe una factura con ese numero para ese proveedor.');
        return false;
      }
      toast.error("Error al registrar: " + (error as Error).message);
      return false;
    }
  },

  updateInvoice: async (invoice: Invoice) => {
    const loadingToast = toast.loading("Actualizando factura...");
    try {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const normalize = (value: string) => value.trim().toLowerCase();
      const suppliers = get().suppliers;
      const supplierById = suppliers.find((s) => s.id === invoice.supplier);
      const supplierByName = suppliers.find((s) => normalize(s.name) === normalize(invoice.supplier));

      const supplierId = uuidRegex.test(invoice.supplier)
        ? invoice.supplier
        : supplierByName?.id ?? null;

      let supplierName = supplierById?.name ?? supplierByName?.name ?? invoice.supplier;

      if (supplierId && uuidRegex.test(supplierId) && (!supplierById?.name)) {
        const { data: supplierFromDb } = await supabase
          .from('suppliers')
          .select('name')
          .eq('id', supplierId)
          .maybeSingle();

        if (supplierFromDb?.name) {
          supplierName = supplierFromDb.name;
        }
      }

      const { error } = await supabase.from('invoices').update({
        number: invoice.number,
        supplier: supplierId,
        date_due: invoice.dateDue,
        status: invoice.status,
        items: invoice.items,
        subtotal_usd: invoice.subtotalUSD,
        freight_total_usd: invoice.freightTotalUSD,
        tax_total_usd: invoice.taxTotalUSD,
        total_usd: invoice.totalUSD,
        paid_amount_usd: invoice.paidAmountUSD,
        payments: invoice.payments
      }).eq('id', invoice.id);

      if (error) throw error;

      set((state) => ({ invoices: state.invoices.map((i) => i.id === invoice.id ? { ...invoice, supplier: supplierName } : i) }));
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

      const methodCurrency = get().paymentMethods.find((method) => method.name === payment.method)?.currency || 'USD';
      const fxRateUsed = payment.fxRateUsed || get().settings.tasaBCV;
      const amountBS = methodCurrency === 'BS'
        ? (payment.amountBS ?? Math.round((payment.amountUSD * fxRateUsed) * 100) / 100)
        : undefined;

      await get().recordCashMovement({
        date: payment.date,
        direction: 'OUT',
        kind: 'ABONO_PROVEEDOR',
        amountUSD: payment.amountUSD,
        amountBS,
        currency: methodCurrency,
        paymentMethod: payment.method,
        description: `Abono a proveedor (${invoice.supplier}) · Factura #${invoice.number}`,
        referenceType: 'invoice-payment',
        referenceId: payment.id,
        userId: get().currentUserData?.id,
        sellerName: get().currentUserData?.fullName,
      });

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
