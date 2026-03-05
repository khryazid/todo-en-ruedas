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
<<<<<<< HEAD
      // 1. Resolve Supplier UUID (invoices expects UUID, products expects string name)
      let supplierId = invoice.supplier;
      let supplierName = invoice.supplier;

      let existingSupplier = get().suppliers.find(s =>
        s.name.trim().toLowerCase() === invoice.supplier.trim().toLowerCase() ||
        s.id === invoice.supplier
      );

      if (!existingSupplier) {
        // Create the missing supplier on the fly
        const { data: supData, error: supError } = await supabase.from('suppliers').insert({
          name: invoice.supplier.trim() || 'Proveedor Automático'
        }).select().single();

        if (supError) throw new Error(`No se pudo crear el proveedor: ${supError.message}`);
        existingSupplier = supData as Supplier;

        // Update local state so it appears in Dropdowns
        set(state => ({ suppliers: [...state.suppliers, existingSupplier as Supplier] }));
      }

      supplierId = existingSupplier!.id;
      supplierName = existingSupplier!.name;

      // 2. Insert Invoice using the UUID
=======
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

>>>>>>> QA
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
<<<<<<< HEAD
            supplier: supplierName, // Products table expects TEXT for supplier
=======
            supplier: supplierName,
>>>>>>> QA
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
<<<<<<< HEAD
=======

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

>>>>>>> QA
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
