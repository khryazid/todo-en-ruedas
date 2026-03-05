/**
 * @file slices/saleSlice.ts
 * @description Operaciones de ventas: completar, anular, eliminar, registrar abonos.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { Sale, Payment, SaleStatus } from '../../types';
import type { SetState, GetState } from '../types';
import { generateId } from '../../utils/id';

export const createSaleSlice = (set: SetState, get: GetState) => ({

  sales: [] as Sale[],

  fetchSales: async () => {
    try {
      const { data: salesData, error } = await supabase
        .from('sales')
        .select('*, sale_items(*), payments(*)')
        .order('date', { ascending: false })
        .limit(100);

      if (error) throw error;

      set({
        sales: (salesData || []).map((s) => ({
          id: s.id,
          localId: s.local_id,
          date: s.date,
          clientId: s.client_id,
          totalUSD: s.total_usd,
          totalVED: s.total_ved,
          paymentMethod: s.payment_method,
          status: s.status,
          paidAmountUSD: s.paid_amount_usd,
          isCredit: s.is_credit || false,
          userId: s.user_id || undefined,
          sellerName: s.seller_name || undefined,
          items: (s.sale_items || []).map((i: Record<string, unknown>) => ({
            sku: i.sku || 'N/A',
            name: i.product_name_snapshot || 'Producto',
            quantity: i.quantity,
            priceFinalUSD: i.unit_price_usd,
            costUnitUSD: i.cost_unit_usd
          })),
          payments: (s.payments || []).map((p: Record<string, unknown>) => ({
            id: p.id,
            date: p.created_at,
            amountUSD: p.amount_usd,
            method: p.method,
            note: p.note
          }))
        }))
      });
    } catch (error) {
      console.warn('fetchSales realtime sync:', error);
    }
  },

  completeSale: async (paymentMethod: string, clientId?: string, initialPayment?: number) => {
    const { cart, settings, products, currentUserData } = get();
    toast.dismiss();

    if (cart.length === 0) {
      toast.error("El carrito está vacío 🛒");
      return null;
    }

    // Validar contra stock en vivo para evitar desajustes por estado local desactualizado.
    const cartProductIds = cart.map((item) => item.id);
    const { data: liveProducts, error: liveProductsError } = await supabase
      .from('products')
      .select('id, stock')
      .in('id', cartProductIds);

    if (!liveProductsError && liveProducts) {
      const liveStockById = new Map(liveProducts.map((row) => [row.id as string, Number(row.stock) || 0]));

      set((state) => ({
        products: state.products.map((p) => {
          const liveStock = liveStockById.get(p.id);
          return liveStock !== undefined ? { ...p, stock: liveStock } : p;
        })
      }));
    }

    const invalidItem = cart.find((item) => {
      const liveStock = liveProducts?.find((row) => row.id === item.id)?.stock;
      const fallbackProduct = products.find((p) => p.id === item.id);
      const available = liveStock !== undefined ? Number(liveStock) : Number(fallbackProduct?.stock ?? 0);
      return !fallbackProduct || Number(item.quantity) > available;
    });

    if (invalidItem) {
      const product = get().products.find((p) => p.id === invalidItem.id);
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

      const rpcItems = cart.map((item) => ({
        product_id: item.id,
        sku: item.sku,
        product_name: item.name,
        quantity: Number(item.quantity),
        unit_price_usd: Number(item.priceFinalUSD),
        cost_unit_usd: Number(item.cost),
      }));

      const { data: rpcData, error: saleError } = await supabase.rpc('process_sale_atomic', {
        p_client_id: clientId || null,
        p_payment_method: paymentMethod,
        p_paid_amount_usd: paidAmount,
        p_status: status,
        p_total_usd: totalUSD,
        p_total_ved: totalVED,
        p_is_credit: isCredit,
        p_user_id: currentUserData?.id || null,
        p_seller_name: currentUserData?.fullName || null,
        p_items: rpcItems,
      });

      if (saleError || !rpcData || rpcData.length === 0) throw new Error(saleError?.message || 'No se pudo procesar la venta');
      const saleData = rpcData[0] as { sale_id: string; local_id: number | null; sale_date: string };

      for (const item of cart) {
        const product = products.find((p) => p.id === item.id);
        if (!product) continue;

        await get().addStockMovement({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          type: 'SALE',
          qtyBefore: Number(product.stock),
          qtyChange: -Number(item.quantity),
          referenceId: saleData.sale_id,
        });
      }

      // 🚀 FAILSAFE: Si Supabase (vía PostgREST caché) no devuelve todavía la nueva columna local_id
      // Forzaremos el visualizador asumiendo el id de la venta anterior + 1.
      const lastId = get().sales.length > 0 ? (get().sales[0].localId || 0) : 0;
      const calculatedLocalId = saleData.local_id ? saleData.local_id : lastId + 1;

      if (paidAmount > 0) {
        const methodCurrency = get().paymentMethods.find((method) => method.name === paymentMethod)?.currency || 'USD';
        const amountBS = methodCurrency === 'BS'
          ? Math.round((paidAmount * settings.tasaBCV) * 100) / 100
          : undefined;

        await get().recordCashMovement({
          date: saleData.sale_date,
          direction: 'IN',
          kind: 'VENTA_COBRADA',
          amountUSD: paidAmount,
          amountBS,
          currency: methodCurrency,
          paymentMethod,
          description: `Cobro inicial de venta #${calculatedLocalId || saleData.sale_id.slice(-6)}`,
          referenceType: 'sale-payment',
          referenceId: `${saleData.sale_id}:initial`,
          userId: currentUserData?.id,
          sellerName: currentUserData?.fullName,
        });
      }

      // Tomar stock real post-venta para evitar desajustes visuales en POS bajo concurrencia.
      const affectedProductIds = cart.map((item) => item.id);
      const { data: updatedStocksData } = await supabase
        .from('products')
        .select('id, stock')
        .in('id', affectedProductIds);

      const stockById = new Map<string, number>(
        (updatedStocksData || []).map((row) => [String(row.id), Number(row.stock) || 0])
      );
      const hasSyncedStocks = stockById.size > 0;

      // Incremental update: build sale locally and update stock
      const newSale: Sale = {
        id: saleData.sale_id,
        localId: calculatedLocalId,
        date: saleData.sale_date,
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
          id: generateId(),
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
          const syncedStock = stockById.get(p.id);
          if (syncedStock !== undefined) {
            return { ...p, stock: syncedStock };
          }

          if (!hasSyncedStocks) {
            const cartItem = cart.find((ci) => ci.id === p.id);
            if (cartItem) {
              return { ...p, stock: Number(p.stock) - Number(cartItem.quantity) };
            }
          }

          return p;
        })
      }));

      toast.dismiss(loadingToast);
      toast.success(`✅ Venta Registrada\nTicket #${calculatedLocalId || saleData.sale_id.slice(-6)}`);

      return newSale;

    } catch (error: unknown) {
      toast.dismiss(loadingToast);
      const message = (error as Error).message || 'Error desconocido';

      if (message.includes('STOCK_INSUFICIENTE:')) {
        const match = message.match(/STOCK_INSUFICIENTE:([^:]+):disponible=([^,]+),solicitado=(.+)$/);
        if (match) {
          const [, productId, availableRaw, requestedRaw] = match;
          await get().fetchProducts();
          const product = get().products.find((p) => p.id === productId);
          const productName = product?.name || 'Producto';
          toast.error(
            `⛔ STOCK ACTUALIZADO\n${productName}\nSolicitaste: ${requestedRaw}\nDisponible real: ${availableRaw}`,
            { duration: 6000, style: { border: '2px solid red' } }
          );
          return null;
        }
      }

      toast.error(`Error crítico: ${message}`);
      return null;
    }
    // ✅ FIX TypeScript: retorno explícito para garantizar Promise<Sale | null>
    return null;
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

      const methodCurrency = get().paymentMethods.find((method) => method.name === payment.method)?.currency || 'USD';
      const amountBS = methodCurrency === 'BS'
        ? Math.round((payment.amountUSD * get().settings.tasaBCV) * 100) / 100
        : undefined;

      await get().recordCashMovement({
        date: payment.date,
        direction: 'IN',
        kind: 'ABONO_CLIENTE',
        amountUSD: payment.amountUSD,
        amountBS,
        currency: methodCurrency,
        paymentMethod: payment.method,
        description: `Abono de cliente a venta #${sale.localId || sale.id.slice(-6)}`,
        referenceType: 'sale-payment',
        referenceId: payment.id,
        userId: sale.userId,
        sellerName: sale.sellerName,
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
