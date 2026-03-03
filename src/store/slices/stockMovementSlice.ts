/**
 * @file slices/stockMovementSlice.ts
 * @description Registro de movimientos de inventario.
 * Cada entrada/salida de stock genera un log persistente en Supabase.
 */

import { supabase } from '../../supabase/client';
import type { StockMovement, StockMovementType } from '../../types';
import type { SetState, GetState } from '../types';

export interface AddMovementPayload {
    productId: string;
    productName: string;
    sku: string;
    type: StockMovementType;
    qtyBefore: number;
    qtyChange: number;
    referenceId?: string;
    reason?: string;
}

export const createStockMovementSlice = (set: SetState, get: GetState) => ({

    stockMovements: [] as StockMovement[],

    fetchStockMovements: async (productId?: string) => {
        try {
            let query = supabase
                .from('stock_movements')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);

            if (productId) query = query.eq('product_id', productId);

            const { data, error } = await query;
            if (error) { console.error('fetchStockMovements:', error); return; }

            const mapped: StockMovement[] = (data || []).map((r: Record<string, unknown>) => ({
                id: r.id as string,
                productId: r.product_id as string,
                productName: r.product_name as string,
                sku: r.sku as string,
                type: r.type as StockMovementType,
                qtyBefore: Number(r.qty_before),
                qtyChange: Number(r.qty_change),
                qtyAfter: Number(r.qty_after),
                reason: r.reason as string | undefined,
                referenceId: r.reference_id as string | undefined,
                createdBy: r.created_by as string | undefined,
                sellerName: r.seller_name as string | undefined,
                createdAt: r.created_at as string,
            }));

            set({ stockMovements: mapped });
        } catch (err) {
            console.error('fetchStockMovements error:', err);
        }
    },

    addStockMovement: async (payload: AddMovementPayload) => {
        try {
            const { currentUserData } = get();
            const qtyAfter = payload.qtyBefore + payload.qtyChange;

            const { data, error } = await supabase.from('stock_movements').insert({
                product_id: payload.productId,
                product_name: payload.productName,
                sku: payload.sku,
                type: payload.type,
                qty_before: payload.qtyBefore,
                qty_change: payload.qtyChange,
                qty_after: qtyAfter,
                reason: payload.reason || null,
                reference_id: payload.referenceId || null,
                created_by: currentUserData?.id || null,
                seller_name: currentUserData?.fullName || null,
            }).select().single();

            if (error) { console.error('addStockMovement:', error); return; }

            if (data) {
                const newMovement: StockMovement = {
                    id: data.id as string,
                    productId: payload.productId,
                    productName: payload.productName,
                    sku: payload.sku,
                    type: payload.type,
                    qtyBefore: payload.qtyBefore,
                    qtyChange: payload.qtyChange,
                    qtyAfter,
                    reason: payload.reason,
                    referenceId: payload.referenceId,
                    createdBy: currentUserData?.id,
                    sellerName: currentUserData?.fullName,
                    createdAt: data.created_at as string,
                };
                set(state => ({ stockMovements: [newMovement, ...state.stockMovements] }));
            }
        } catch (err) {
            console.error('addStockMovement error:', err);
        }
    },
});
