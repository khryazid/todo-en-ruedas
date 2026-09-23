/**
 * @file slices/returnSlice.ts
 * @description Gestión de devoluciones de ventas con Notas de Crédito (NC).
 * Genera número único NC-XXXX, ofrece dos opciones:
 *   - CREDIT   → stock + saldo a favor del cliente
 *   - REEMBOLSO → stock + reembolso en efectivo
 */

import toast from 'react-hot-toast';
import { supabase } from '../../supabase/client';
import type { SetState, GetState } from '../types';
import type { SaleReturn, ReturnOption } from '../../types';
import { roundTo } from '../../utils/pricing';

export interface ReturnSlice {
    returns: SaleReturn[];
    fetchReturns: () => Promise<void>;
    addReturn: (ret: Omit<SaleReturn, 'id' | 'date'>, option?: ReturnOption) => Promise<boolean>;
}

/** Generate NC number via RPC: public.get_next_nc_number() → "NC-0001"
 *  Uses a PostgreSQL SEQUENCE for collision-free numbering under concurrency.
 *  Falls back to a timestamp-based slug if the RPC is unavailable (e.g. local dev without migration applied).
 */
async function nextNcNumber(): Promise<string> {
    const { data, error } = await supabase.rpc('get_next_nc_number');
    if (!error && typeof data === 'string' && data.startsWith('NC-')) {
        return data;
    }
    if (error) {
        console.error('[returnSlice] get_next_nc_number RPC failed:', error.message);
    }
    // Fallback: timestamp slug — non-sequential but avoids duplicates in dev
    const ts = Date.now().toString().slice(-6);
    return `NC-T${ts}`;
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
            option: (r.option as ReturnOption | undefined) ?? 'REEMBOLSO',
            ncNumber: r.nc_number as string | undefined,
            clientId: r.client_id as string | undefined,
            userId: r.user_id as string | undefined,
            sellerName: r.seller_name as string | undefined,
            items: (r.items as SaleReturn['items']) || [],
        }));
        set({ returns: mapped });
    },

    addReturn: async (ret, option = 'REEMBOLSO'): Promise<boolean> => {
        const { products, currentUserData } = get();
        const loadingToast = toast.loading('Procesando devolución...');

        try {
            // 1. Generate NC number
            const ncNumber = await nextNcNumber();
            const refundAmountUSD = roundTo(ret.refundAmountUSD, 2);

            // 2. Insert into Supabase
            const { data, error } = await supabase.from('returns').insert({
                sale_id: ret.saleId,
                reason: ret.reason || null,
                refund_amount_usd: refundAmountUSD,
                type: ret.type,
                option,
                nc_number: ncNumber,
                client_id: ret.clientId || null,
                user_id: currentUserData?.id || null,
                seller_name: currentUserData?.fullName || null,
                items: ret.items,
            }).select().single();

            if (error || !data) throw new Error(error?.message);

            // 3. Restore stock for returned items using atomic RPC (avoids race conditions)
            for (const item of ret.items) {
                if (item.productId) {
                    const product = products.find(p => p.id === item.productId);
                    if (product) {
                        const { error: stockError } = await supabase.rpc('adjust_product_stock', {
                            p_product_id: item.productId,
                            p_delta: Number(item.quantity), // positive delta = stock restored
                        });
                        if (stockError) {
                            console.error('[returnSlice] adjust_product_stock failed:', stockError.message);
                            // Continue with remaining items — do not abort the whole return
                        }
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

            // 3b. If REEMBOLSO, register cash outflow in ledger
            if (option === 'REEMBOLSO' && refundAmountUSD > 0) {
                await get().recordCashMovement({
                    date: new Date().toISOString(),
                    direction: 'OUT',
                    kind: 'AJUSTE',
                    amountUSD: refundAmountUSD,
                    currency: 'USD',
                    paymentMethod: 'Efectivo USD',
                    description: `Reembolso devolución ${ncNumber}${ret.reason ? ` — ${ret.reason}` : ''}`,
                    referenceType: 'return',
                    referenceId: data.id as string,
                    userId: get().currentUserData?.id,
                    sellerName: get().currentUserData?.fullName,
                });
            }

            // 4. If FULL return, mark sale as CANCELLED
            if (ret.type === 'FULL') {
                await supabase.from('sales').update({ status: 'CANCELLED' }).eq('id', ret.saleId);
            }

            // 5. If CREDIT option, add credit balance to client
            if (option === 'CREDIT' && ret.clientId) {
                await get().applyClientCredit(ret.clientId, refundAmountUSD);
            }

            // 6. Build local return object
            const newReturn: SaleReturn = {
                id: data.id as string,
                saleId: ret.saleId,
                date: data.date as string,
                reason: ret.reason,
                refundAmountUSD: ret.refundAmountUSD,
                type: ret.type,
                option,
                ncNumber,
                clientId: ret.clientId,
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
                sales: ret.type === 'FULL'
                    ? state.sales.map(s => s.id === ret.saleId ? { ...s, status: 'CANCELLED' as const } : s)
                    : state.sales,
                // Update client credit balance in local state
                clients: (option === 'CREDIT' && ret.clientId)
                    ? state.clients.map(c => c.id === ret.clientId
                        ? { ...c, creditBalance: (c.creditBalance ?? 0) + ret.refundAmountUSD }
                        : c)
                    : state.clients,
            }));

            toast.dismiss(loadingToast);
            const msg = option === 'CREDIT'
                ? `✅ ${ncNumber} generada — $${ret.refundAmountUSD.toFixed(2)} como saldo a favor`
                : `✅ ${ncNumber} generada — $${ret.refundAmountUSD.toFixed(2)} a reembolsar`;
            toast.success(msg, { duration: 5000 });
            return true;
        } catch (err) {
            toast.dismiss(loadingToast);
            toast.error('Error al procesar la devolución');
            console.error(err);
            return false;
        }
    },
});
