/**
 * @file slices/saleSlice.ts
 * @description Operaciones de ventas: completar, anular, eliminar, registrar abonos.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { Sale, Payment, SaleStatus } from '../../types';

export const createSaleSlice = (set: any, get: any) => ({

  sales: [] as Sale[],

  completeSale: async (paymentMethod: string, clientId?: string, initialPayment?: number) => {
    const { cart, settings, products } = get();
    toast.dismiss();

    if (cart.length === 0) {
      toast.error("El carrito está vacío 🛒");
      return;
    }

    const invalidItem = cart.find((item: any) => {
      const product = products.find((p: any) => p.id === item.id);
      return !product || Number(item.quantity) > Number(product.stock);
    });

    if (invalidItem) {
      const product = products.find((p: any) => p.id === invalidItem.id);
      const currentStock = product ? Number(product.stock) : 0;
      toast.error(
        `⛔ STOCK INSUFICIENTE\n${invalidItem.name}\nSolicitas: ${invalidItem.quantity}\nDisponible: ${currentStock}`,
        { duration: 5000, style: { border: '2px solid red' } }
      );
      return;
    }

    const loadingToast = toast.loading('Procesando venta...');

    try {
      const totalUSD = Math.round(cart.reduce((acc: number, item: any) => acc + (item.priceFinalUSD * item.quantity), 0) * 100) / 100;
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
        is_credit: isCredit
      }).select().single();

      if (saleError || !saleData) throw new Error(saleError?.message);

      const saleItems = cart.map((item: any) => ({
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
        const product = products.find((p: any) => p.id === item.id);
        if (product) {
          const newStock = Number(product.stock) - Number(item.quantity);
          await supabase.from('products').update({ stock: newStock }).eq('id', item.id);
        }
      }

      toast.dismiss(loadingToast);
      toast.success(`✅ Venta Registrada\nTicket #${saleData.id.slice(-6)}`);
      set({ cart: [] });
      get().fetchInitialData();

    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error(`Error crítico: ${error.message}`);
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
            const product = products.find((p: any) => p.id === item.product_id);
            if (product) {
              const restoredStock = Number(product.stock) + Number(item.quantity);
              await supabase.from('products').update({ stock: restoredStock }).eq('id', item.product_id);
            }
          }
        }
      }

      toast.dismiss(loadingToast);
      toast.success("Venta anulada y stock devuelto 📦");
      get().fetchInitialData();

    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error("Error al anular: " + error.message);
    }
  },

  deleteSale: async (saleId: string) => {
    const loadingToast = toast.loading("Eliminando venta...");
    try {
      const { error } = await supabase.from('sales').delete().eq('id', saleId);
      if (error) throw error;

      set((state: any) => ({ sales: state.sales.filter((s: any) => s.id !== saleId) }));
      toast.dismiss(loadingToast);
      toast.success("Venta eliminada del historial 🗑️");
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error("Error al eliminar: " + error.message);
    }
  },

  registerSalePayment: async (saleId: string, payment: Payment) => {
    const sale = get().sales.find((s: any) => s.id === saleId);
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
      let newStatus = sale.status;
      if (newPaid >= sale.totalUSD - 0.01) newStatus = 'COMPLETED';
      else if (newPaid > 0) newStatus = 'PARTIAL';

      await supabase.from('sales').update({
        paid_amount_usd: newPaid,
        status: newStatus
      }).eq('id', saleId);

      toast.success("Abono registrado");
      get().fetchInitialData();
    } catch (error: any) {
      toast.error("Error: " + error.message);
    }
  },
});
