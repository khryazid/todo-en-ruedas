/**
 * @file slices/saleSlice.ts
 * @description Operaciones de ventas: completar, anular, eliminar, registrar abonos.
 *
 * ✅ FIX: fetchSales usa mapSaleFromDB centralizado.
 * ✅ FIX: annulSale usa adjust_product_stock RPC atómico.
 * ✅ FIX: Eliminado return null inalcanzable al final de completeSale.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { Sale, Payment, SaleStatus } from '../../types';
import type { SetState, GetState } from '../types';
import { generateId } from '../../utils/id';
import { mapSaleFromDB } from '../../utils/mappers';
import { roundTo } from '../../utils/pricing';

export const createSaleSlice = (set: SetState, get: GetState) => ({

  sales: [] as Sale[],

  fetchSales: async () => {
    try {
      let query = supabase
        .from('sales')
        .select('*, sale_items(*), payments(*)')
        .order('date', { ascending: false })
        .limit(500);

      const orgId = get().currentOrganization?.id;
      if (orgId) query = query.eq('organization_id', orgId);

      const { data: salesData, error } = await query;
      if (error) throw error;

      // ✅ FIX: Usar mapeo centralizado
      set({ sales: (salesData || []).map(mapSaleFromDB) });
    } catch (error) {
      console.warn('fetchSales realtime sync:', error);
    }
  },

  completeSale: async (
    paymentMethod: string,
    clientId?: string,
    initialPayment?: number,
    idempotencyKey?: string,
    discountPct: number = 0
  ) => {
    // idempotencyKey está disponible para auditoría/trazabilidad del despacho
    if (import.meta.env.DEV && idempotencyKey) {
      console.debug('[POS] completeSale iniciado con token:', idempotencyKey);
    }
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
      // 1. Cálculo financiero exacto con descuento contable
      const grossSubtotalUSD = roundTo(
        cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0),
        2
      );

      const safeDiscountPct = Math.min(100, Math.max(0, discountPct));
      const discountAmountUSD = roundTo(grossSubtotalUSD * (safeDiscountPct / 100), 2);
      const totalUSD = roundTo(grossSubtotalUSD - discountAmountUSD, 2);
      const totalVED = roundTo(totalUSD * settings.tasaBCV, 2);

      // 2. Determinación de Estado Real de Pago contra el NETO FACTURADO
      const paidAmount = initialPayment !== undefined ? roundTo(initialPayment, 2) : totalUSD;
      const isCredit = paidAmount < (totalUSD - 0.01);
      let status: SaleStatus = 'COMPLETED';
      if (isCredit) {
        status = paidAmount > 0 ? 'PARTIAL' : 'PENDING';
      }

      const rpcItems = cart.map((item) => ({
        product_id: item.id,
        sku: item.sku,
        product_name: item.name,
        quantity: Number(item.quantity),
        unit_price_usd: Number(item.priceFinalUSD),
        cost_unit_usd: Number(item.cost),
        discount_pct: safeDiscountPct,
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
        p_discount_pct: safeDiscountPct,
        p_tasa_bcv: settings.tasaBCV,
        p_tasa_cop: settings.tasaCOP,
        p_organization_id: get().currentOrganization?.id || null,
      });

      if (saleError || !rpcData || rpcData.length === 0) throw new Error(saleError?.message || 'No se pudo procesar la venta');
      const saleData = rpcData[0] as { sale_id: string; local_id: number | null; sale_date: string };

      // 🚀 FAILSAFE: Si Supabase (vía PostgREST caché) no devuelve todavía la nueva columna local_id
      // Forzaremos el visualizador asumiendo el id de la venta anterior + 1.
      const lastId = get().sales.length > 0 ? (get().sales[0].localId || 0) : 0;
      const calculatedLocalId = saleData.local_id ? saleData.local_id : lastId + 1;

      // Sincronizar Kardex y Libro de Caja (insertados atómicamente por process_sale_atomic)
      const currentRole = currentUserData?.role ?? 'VIEWER';
      const isElevated = currentRole === 'ADMIN' || currentRole === 'MANAGER';
      if (isElevated) {
        try {
          void get().fetchStockMovements();
          void get().fetchCashLedger();
        } catch {
          // Sync silencioso vía realtime
        }
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

      if (message.includes('CREDITO_INSUFICIENTE:')) {
        const match = message.match(/CREDITO_INSUFICIENTE:([^:]+):limite=([^,]+),deuda_actual=([^,]+),nueva_deuda=(.+)$/);
        if (match) {
          const [, , limitRaw, currentDebtRaw, newDebtRaw] = match;
          toast.error(
            `⛔ CRÉDITO EXCEDIDO\nLímite: $${Number(limitRaw).toFixed(2)}\nDeuda actual: $${Number(currentDebtRaw).toFixed(2)}\nNueva deuda: $${Number(newDebtRaw).toFixed(2)}`,
            { duration: 6000, style: { border: '2px solid red' } }
          );
          return null;
        }
      }

      if (message.includes('VENTA_CREDITO_SIN_CLIENTE:')) {
        toast.error('⛔ Venta a crédito requiere asignar un cliente registrado.', {
          duration: 5000,
          style: { border: '2px solid red' },
        });
        return null;
      }

      toast.error(`Error crítico: ${message}`);
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

      // ✅ FIX: Usar adjust_product_stock RPC atómico en lugar de
      // updates raw basados en stock local (evita race conditions)
      if (saleItems) {
        for (const item of saleItems) {
          if (item.product_id) {
            await supabase.rpc('adjust_product_stock', {
              p_product_id: item.product_id,
              p_delta: Number(item.quantity), // positivo = restaurar stock
            });
          }
        }
      }

      // Refrescar stock real desde la DB para evitar desajustes visuales
      const affectedIds = (saleItems || []).map((si) => si.product_id).filter(Boolean) as string[];
      if (affectedIds.length > 0) {
        const { data: updatedProducts } = await supabase
          .from('products')
          .select('id, stock')
          .in('id', affectedIds);

        const stockMap = new Map((updatedProducts || []).map((p) => [p.id as string, Number(p.stock) || 0]));

        set((state) => ({
          sales: state.sales.map((s) => s.id === saleId ? { ...s, status: 'CANCELLED' as SaleStatus } : s),
          products: state.products.map((p) => {
            const newStock = stockMap.get(p.id);
            return newStock !== undefined ? { ...p, stock: newStock } : p;
          })
        }));
      } else {
        set((state) => ({
          sales: state.sales.map((s) => s.id === saleId ? { ...s, status: 'CANCELLED' as SaleStatus } : s),
        }));
      }

      // ✅ AUDIT FIX #14: Registrar reverso en cash_ledger si la venta tenía montos cobrados
      const sale = get().sales.find((s) => s.id === saleId);
      if (sale && sale.paidAmountUSD > 0) {
        await get().recordCashMovement({
          date: new Date().toISOString(),
          direction: 'OUT',
          kind: 'AJUSTE',
          amountUSD: sale.paidAmountUSD,
          currency: 'USD',
          paymentMethod: sale.paymentMethod || 'Efectivo',
          description: `Reverso por anulación de venta #${sale.localId || sale.id.slice(-6)}`,
          referenceType: 'sale-annul',
          referenceId: `${sale.id}:annul`,
          userId: get().currentUserData?.id,
          sellerName: get().currentUserData?.fullName,
        });
      }

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
      // ✅ AUDIT FIX #14: Si la venta no estaba cancelada, revertir stock y ajustar caja antes de borrar
      const sale = get().sales.find((s) => s.id === saleId);
      if (sale && sale.status !== 'CANCELLED') {
        const { data: saleItems } = await supabase
          .from('sale_items')
          .select('product_id, quantity')
          .eq('sale_id', saleId);

        if (saleItems && saleItems.length > 0) {
          for (const item of saleItems) {
            if (item.product_id) {
              await supabase.rpc('adjust_product_stock', {
                p_product_id: item.product_id,
                p_delta: Number(item.quantity),
              });
            }
          }
        }

        if (sale.paidAmountUSD > 0) {
          await get().recordCashMovement({
            date: new Date().toISOString(),
            direction: 'OUT',
            kind: 'AJUSTE',
            amountUSD: sale.paidAmountUSD,
            currency: 'USD',
            paymentMethod: sale.paymentMethod || 'Efectivo',
            description: `Reverso por eliminación de venta #${sale.localId || sale.id.slice(-6)}`,
            referenceType: 'sale-delete',
            referenceId: `${sale.id}:delete`,
            userId: get().currentUserData?.id,
            sellerName: get().currentUserData?.fullName,
          });
        }

        await get().fetchProducts();
      }

      const { error } = await supabase.from('sales').delete().eq('id', saleId);
      if (error) throw error;

      set((state) => ({ sales: state.sales.filter((s) => s.id !== saleId) }));
      toast.dismiss(loadingToast);
      toast.success("Venta eliminada y stock/caja sincronizados 🗑️");
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
      const amountCOP = methodCurrency === 'COP'
        ? Math.round((payment.amountUSD * get().settings.tasaCOP))
        : undefined;

      await get().recordCashMovement({
        date: payment.date,
        direction: 'IN',
        kind: 'ABONO_CLIENTE',
        amountUSD: payment.amountUSD,
        amountBS,
        amountCOP,
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
