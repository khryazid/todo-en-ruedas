/**
 * @file slices/returnSlice.ts
 * @description Gestión de devoluciones de ventas.
 * Permite reembolsos parciales o totales restaurando el stock.
 */

import toast from 'react-hot-toast';
import { supabase } from '../../supabase/client';
import type { SetState, GetState } from '../types';
import type { SaleReturn } from '../../types';

export interface ReturnSlice {
    returns: SaleReturn[];
    fetchReturns: () => Promise<void>;
    addReturn: (ret: Omit<SaleReturn, 'id' | 'date'>) => Promise<boolean>;
}

export const createReturnSlice = (set: SetState, get: GetState): ReturnSlice => ({

    returns: [],

    fetchReturns: async () => {
        const { data, error } = await supabase
            .from('returns')
            .select('*')
            .order('date', { ascending: false });
        if (error) { console.error(error); return; }
        const mapped: SaleReturn[] = (data || []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            saleId: r.sale_id as string,
            date: r.date as string,
            reason: r.reason as string | undefined,
            refundAmountUSD: Number(r.refund_amount_usd),
            type: r.type as 'PARTIAL' | 'FULL',
            userId: r.user_id as string | undefined,
            sellerName: r.seller_name as string | undefined,
            items: (r.items as SaleReturn['items']) || [],
        }));
        set({ returns: mapped });
    },

    addReturn: async (ret): Promise<boolean> => {
        const { products, currentUserData } = get();
        const loadingToast = toast.loading('Procesando devolución...');

        try {
            // 1. Insertar en Supabase
            const { data, error } = await supabase.from('returns').insert({
                sale_id: ret.saleId,
                reason: ret.reason || null,
                refund_amount_usd: ret.refundAmountUSD,
                type: ret.type,
                user_id: currentUserData?.id || null,
                seller_name: currentUserData?.fullName || null,
                items: ret.items,
            }).select().single();

            if (error || !data) throw new Error(error?.message);

            // 2. Restaurar stock de los items devueltos
            for (const item of ret.items) {
                if (item.productId) {
                    const product = products.find(p => p.id === item.productId);
                    if (product) {
                        const newStock = product.stock + item.quantity;
                        await supabase.from('products').update({ stock: newStock }).eq('id', item.productId);
                        // 📦 Log RETURN movement
                        await get().addStockMovement({
                            productId: product.id,
                            productName: product.name,
                            sku: product.sku,
                            type: 'RETURN',
                            qtyBefore: product.stock,
                            qtyChange: item.quantity,
                            referenceId: data.id as string,
                            reason: ret.reason,
                        });
                    }
                }
            }

            // 3. Si es devolución total, marcar la venta como CANCELLED
            if (ret.type === 'FULL') {
                await supabase.from('sales').update({ status: 'CANCELLED' }).eq('id', ret.saleId);
            }

            // 4. Actualizar store local
            const newReturn: SaleReturn = {
                id: data.id as string,
                saleId: ret.saleId,
                date: data.date as string,
                reason: ret.reason,
                refundAmountUSD: ret.refundAmountUSD,
                type: ret.type,
                userId: currentUserData?.id,
                sellerName: currentUserData?.fullName,
                items: ret.items,
            };

            set(state => ({
                returns: [newReturn, ...state.returns],
                products: state.products.map(p => {
                    const item = ret.items.find(i => i.productId === p.id);
                    return item ? { ...p, stock: p.stock + item.quantity } : p;
                }),
                // Si FULL, marcar la venta como cancelada en local
                sales: ret.type === 'FULL'
                    ? state.sales.map(s => s.id === ret.saleId ? { ...s, status: 'CANCELLED' as const } : s)
                    : state.sales,
            }));

            toast.dismiss(loadingToast);
            toast.success(`✅ Devolución registrada — $${ret.refundAmountUSD.toFixed(2)} reembolsados`);
            return true;
        } catch (err) {
            toast.dismiss(loadingToast);
            toast.error('Error al procesar la devolución');
            console.error(err);
            return false;
        }
    },
});
