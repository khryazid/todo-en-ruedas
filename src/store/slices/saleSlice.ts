/**
 * @file slices/saleSlice.ts
 * @description Operaciones de ventas: completar, anular, eliminar, registrar abonos.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { Sale, Payment, SaleStatus } from '../../types';
import type { SetState, GetState } from '../types';

export const createSaleSlice = (set: SetState, get: GetState) => ({

  sales: [] as Sale[],

  completeSale: async (paymentMethod: string, clientId?: string, initialPayment?: number) => {
    const { cart, settings, products, currentUserData } = get();
    toast.dismiss();

    if (cart.length === 0) {
      toast.error("El carrito está vacío 🛒");
      return null;
    }

    const invalidItem = cart.find((item) => {
      const product = products.find((p) => p.id === item.id);
      return !product || Number(item.quantity) > Number(product.stock);
    });

    if (invalidItem) {
      const product = products.find((p) => p.id === invalidItem.id);
      const currentStock = product ? Number(product.stock) : 0;
      toast.error(
        `⛔ STOCK INSUFICIENTE\n${invalidItem.name}\nSolicitas: ${invalidItem.quantity}\nDisponible: ${currentStock}`,
        { duration: 5000, style: { border: '2px solid red' } }
      );
      return null;
    }

    const loadingToast = toast.loading('Procesando venta...');

    try {
      const totalUSD = Math.round(cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0) * 100) / 100;
      const totalVED = Math.round((totalUSD * settings.tasaBCV) * 100) / 100;

      const paidAmount = initialPayment !== undefined ? initialPayment : totalUSD;
      let status: SaleStatus = 'COMPLETED';
      if (paidAmount < totalUSD - 0.01) status = paidAmount > 0 ? 'PARTIAL' : 'PENDING';

      const isCredit = paidAmount < totalUSD - 0.01;

      const { data: saleData, error: saleError } = await supabase.from('sales').insert({
        client_id: clientId || null,
        total_usd: totalUSD,
        total_ved: totalVED,
        payment_method: paymentMethod,
        status: status,
        paid_amount_usd: paidAmount,
        date: new Date().toISOString(),
        is_credit: isCredit,
        // ✅ FIX #8/#9: Registrar quién realizó la venta
        user_id: currentUserData?.id || null,
        seller_name: currentUserData?.fullName || null,
      }).select().single();

      if (saleError || !saleData) throw new Error(saleError?.message);

      const saleItems = cart.map((item) => ({
        sale_id: saleData.id,
        product_id: item.id,
        quantity: item.quantity,
        unit_price_usd: item.priceFinalUSD,
        cost_unit_usd: item.cost,
        product_name_snapshot: item.name,
        sku: item.sku
      }));

      const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
      if (itemsError) throw new Error(itemsError.message);

      if (paidAmount > 0) {
        await supabase.from('payments').insert({
          sale_id: saleData.id,
          amount_usd: paidAmount,
          method: paymentMethod,
          note: 'Pago Inicial'
        });
      }

      for (const item of cart) {
        const product = products.find((p) => p.id === item.id);
        if (product) {
          const newStock = Number(product.stock) - Number(item.quantity);
          await supabase.from('products').update({ stock: newStock }).eq('id', item.id);
        }
      }

      // Incremental update: build sale locally and update stock
      const newSale: Sale = {
        id: saleData.id,
        date: saleData.date,
        clientId: clientId || undefined,
        totalUSD,
        totalVED,
        paymentMethod,
        status,
        paidAmountUSD: paidAmount,
        isCredit,
        // ✅ FIX #8/#9: Incluir datos del vendedor en el objeto local
        userId: currentUserData?.id,
        sellerName: currentUserData?.fullName,
        items: cart.map((item) => ({
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          priceFinalUSD: item.priceFinalUSD,
          costUnitUSD: item.cost
        })),
        payments: paidAmount > 0 ? [{
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          amountUSD: paidAmount,
          method: paymentMethod,
          note: 'Pago Inicial'
        }] : []
      };

      set((state) => ({
        cart: [],
        sales: [newSale, ...state.sales],
        products: state.products.map((p) => {
          const cartItem = cart.find((ci) => ci.id === p.id);
          if (cartItem) {
            return { ...p, stock: Number(p.stock) - Number(cartItem.quantity) };
          }
          return p;
        })
      }));

      toast.dismiss(loadingToast);
      toast.success(`✅ Venta Registrada\nTicket #${saleData.id.slice(-6)}`);

      return newSale;

    } catch (error: unknown) {
      toast.dismiss(loadingToast);
      toast.error(`Error crítico: ${(error as Error).message}`);
      return null;
    }
  },

  annulSale: async (saleId: string) => {
    const loadingToast = toast.loading('Anulando venta y restaurando stock...');

    try {
      const { data: saleItems, error: fetchError } = await supabase
        .from('sale_items')
        .select('product_id, quantity')
        .eq('sale_id', saleId);

      if (fetchError) throw fetchError;

      const { error: updateError } = await supabase
        .from('sales')
        .update({ status: 'CANCELLED' })
        .eq('id', saleId);

      if (updateError) throw updateError;

      if (saleItems) {
        const { products } = get();
        for (const item of saleItems) {
          if (item.product_id) {
            const product = products.find((p) => p.id === item.product_id);
            if (product) {
              const restoredStock = Number(product.stock) + Number(item.quantity);
              await supabase.from('products').update({ stock: restoredStock }).eq('id', item.product_id);
            }
          }
        }
      }

      // Incremental update: update sale status and restore stock locally
      set((state) => ({
        sales: state.sales.map((s) => s.id === saleId ? { ...s, status: 'CANCELLED' as SaleStatus } : s),
        products: state.products.map((p) => {
          const restoredItem = saleItems?.find((si) => si.product_id === p.id);
          if (restoredItem) {
            return { ...p, stock: Number(p.stock) + Number(restoredItem.quantity) };
          }
          return p;
        })
      }));

      toast.dismiss(loadingToast);
      toast.success("Venta anulada y stock devuelto 📦");

    } catch (error: unknown) {
      toast.dismiss(loadingToast);
      toast.error("Error al anular: " + (error as Error).message);
    }
  },

  deleteSale: async (saleId: string) => {
    const loadingToast = toast.loading("Eliminando venta...");
    try {
      const { error } = await supabase.from('sales').delete().eq('id', saleId);
      if (error) throw error;

      set((state) => ({ sales: state.sales.filter((s) => s.id !== saleId) }));
      toast.dismiss(loadingToast);
      toast.success("Venta eliminada del historial 🗑️");
    } catch (error: unknown) {
      toast.dismiss(loadingToast);
      toast.error("Error al eliminar: " + (error as Error).message);
    }
  },

  registerSalePayment: async (saleId: string, payment: Payment) => {
    const sale = get().sales.find((s) => s.id === saleId);
    if (!sale) return;

    const debt = sale.totalUSD - sale.paidAmountUSD;
    if (payment.amountUSD > debt + 0.01) {
      toast.error(`⚠️ El monto excede la deuda.\nDeuda actual: $${debt.toFixed(2)}`);
      return;
    }

    try {
      await supabase.from('payments').insert({
        sale_id: saleId,
        amount_usd: payment.amountUSD,
        method: payment.method,
        note: payment.note
      });

      const newPaid = sale.paidAmountUSD + payment.amountUSD;
      let newStatus: SaleStatus = sale.status;
      if (newPaid >= sale.totalUSD - 0.01) newStatus = 'COMPLETED';
      else if (newPaid > 0) newStatus = 'PARTIAL';

      await supabase.from('sales').update({
        paid_amount_usd: newPaid,
        status: newStatus
      }).eq('id', saleId);

      // Incremental update: update paid amount and status locally
      set((state) => ({
        sales: state.sales.map((s) =>
          s.id === saleId
            ? {
              ...s,
              paidAmountUSD: newPaid,
              status: newStatus,
              payments: [...s.payments, payment]
            }
            : s
        )
      }));

      toast.success("Abono registrado");
    } catch (error: unknown) {
      toast.error("Error: " + (error as Error).message);
    }
  },
});
