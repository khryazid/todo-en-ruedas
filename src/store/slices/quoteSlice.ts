/**
 * @file store/slices/quoteSlice.ts
 * @description Gestión de Cotizaciones (Quotes): CRUD local + persistencia en Supabase.
 */

import toast from 'react-hot-toast';
import { supabase } from '../../supabase/client';
import type { SetState, GetState } from '../types';
import type { Quote, Sale } from '../../types';

export interface QuoteSlice {
    quotes: Quote[];
    fetchQuotes: () => Promise<void>;
    addQuote: (quote: Quote) => Promise<void>;
    updateQuote: (id: string, updates: Partial<Quote>) => Promise<void>;
    deleteQuote: (id: string) => Promise<void>;
    convertQuoteToSale: (quoteId: string, paymentMethod: string) => Promise<boolean>;
}

export const createQuoteSlice = (set: SetState, get: GetState): QuoteSlice => ({
    quotes: [],

    fetchQuotes: async () => {
        const { data, error } = await supabase
            .from('quotes')
            .select('*')
            .order('date', { ascending: false });

        if (error) { console.error('Error fetching quotes:', error); return; }

        const mapped: Quote[] = (data || []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            number: r.number as string,
            date: r.date as string,
            validUntil: r.valid_until as string,
            clientId: r.client_id as string,
            clientName: r.client_name as string,
            items: (r.items as unknown) as Quote["items"] || [],
            totalUSD: r.total_usd as number,
            totalBs: r.total_bs as number,
            notes: r.notes as string,
            status: r.status as Quote["status"],
            userId: r.user_id as string,
            sellerName: r.seller_name as string,
        }));

        set({ quotes: mapped });

        // #4 Auto-expirar cotizaciones vencidas (silencioso)
        const today = new Date().toISOString().split('T')[0];
        const toExpire = mapped.filter(q =>
            (q.status === 'DRAFT' || q.status === 'SENT') &&
            q.validUntil < today
        );
        if (toExpire.length > 0) {
            const ids = toExpire.map(q => q.id);
            await supabase.from('quotes').update({ status: 'EXPIRED' }).in('id', ids);
            set(state => ({
                quotes: state.quotes.map(q => ids.includes(q.id) ? { ...q, status: 'EXPIRED' as const } : q)
            }));
        }
    },

    addQuote: async (quote: Quote) => {
        const { currentUserData, settings } = get();
        const tasaBCV = settings.tasaBCV || 1;
        const totalBs = quote.totalUSD * tasaBCV;

        const payload = {
            id: quote.id,
            number: quote.number,
            date: quote.date,
            valid_until: quote.validUntil,
            client_id: quote.clientId || null,
            client_name: quote.clientName || null,
            items: quote.items,
            total_usd: quote.totalUSD,
            total_bs: totalBs,
            notes: quote.notes || null,
            status: quote.status,
            user_id: currentUserData?.id || null,
            seller_name: currentUserData?.fullName || null,
        };

        const { error } = await supabase.from('quotes').insert(payload);
        if (error) { toast.error('Error al guardar cotización'); return; }

        set(state => ({
            quotes: [{ ...quote, totalBs, sellerName: currentUserData?.fullName }, ...state.quotes]
        }));
        toast.success(`Cotización ${quote.number} creada ✅`);
    },

    updateQuote: async (id: string, updates: Partial<Quote>) => {
        const dbUpdates: Record<string, unknown> = {};
        if (updates.status !== undefined) dbUpdates.status = updates.status;
        if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
        if (updates.validUntil !== undefined) dbUpdates.valid_until = updates.validUntil;
        if (updates.items !== undefined) {
            dbUpdates.items = updates.items;
            dbUpdates.total_usd = updates.totalUSD;
            dbUpdates.total_bs = updates.totalBs;
        }

        const { error } = await supabase.from('quotes').update(dbUpdates).eq('id', id);
        if (error) { toast.error('Error al actualizar cotización'); return; }

        set(state => ({
            quotes: state.quotes.map(q => q.id === id ? { ...q, ...updates } : q)
        }));
        toast.success('Cotización actualizada');
    },

    deleteQuote: async (id: string) => {
        const { error } = await supabase.from('quotes').delete().eq('id', id);
        if (error) { toast.error('Error al eliminar cotización'); return; }
        set(state => ({ quotes: state.quotes.filter(q => q.id !== id) }));
        toast.success('Cotización eliminada');
    },

    convertQuoteToSale: async (quoteId: string, paymentMethod: string): Promise<boolean> => {
        const { quotes, products, settings, currentUserData } = get();
        const quote = quotes.find(q => q.id === quoteId);
        if (!quote) { toast.error('Cotización no encontrada'); return false; }

        const tasaBCV = settings.tasaBCV || 1;
        const totalUSD = quote.totalUSD;
        const totalVED = Math.round(totalUSD * tasaBCV * 100) / 100;

        const loadingToast = toast.loading('Convirtiendo cotización a venta...');
        try {
            // 1. Insertar venta
            const { data: saleData, error: saleError } = await supabase.from('sales').insert({
                client_id: quote.clientId || null,
                total_usd: totalUSD,
                total_ved: totalVED,
                payment_method: paymentMethod,
                status: 'COMPLETED',
                paid_amount_usd: totalUSD,
                date: new Date().toISOString(),
                is_credit: false,
                user_id: currentUserData?.id || null,
                seller_name: currentUserData?.fullName || null,
            }).select().single();

            if (saleError || !saleData) throw new Error(saleError?.message);

            // 2. Insertar sale_items (buscamos el cost del producto)
            const saleItems = quote.items.map(item => {
                const product = products.find(p => p.id === item.productId);
                return {
                    sale_id: saleData.id,
                    product_id: item.productId,
                    quantity: item.quantity,
                    unit_price_usd: item.priceFinalUSD,
                    cost_unit_usd: product ? (product.cost + (product.freight || 0)) : 0,
                    product_name_snapshot: item.name,
                    sku: item.sku,
                };
            });
            const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
            if (itemsError) throw new Error(itemsError.message);

            // 3. Registrar pago
            await supabase.from('payments').insert({
                sale_id: saleData.id,
                amount_usd: totalUSD,
                method: paymentMethod,
                note: `Convertido desde Cotización ${quote.number}`,
            });

            // 4. Descontar stock
            for (const item of quote.items) {
                const product = products.find(p => p.id === item.productId);
                if (product) {
                    const newStock = Math.max(0, Number(product.stock) - Number(item.quantity));
                    await supabase.from('products').update({ stock: newStock }).eq('id', item.productId);
                }
            }

            // 5. Marcar quote como ACCEPTED
            await supabase.from('quotes').update({ status: 'ACCEPTED' }).eq('id', quoteId);

            // 6. Actualizar store local
            const newSale: Sale = {
                id: saleData.id,
                date: saleData.date,
                clientId: quote.clientId,
                totalUSD,
                totalVED,
                paymentMethod,
                status: 'COMPLETED',
                paidAmountUSD: totalUSD,
                isCredit: false,
                userId: currentUserData?.id,
                sellerName: currentUserData?.fullName,
                items: quote.items.map(item => {
                    const product = products.find(p => p.id === item.productId);
                    return {
                        sku: item.sku,
                        name: item.name,
                        quantity: item.quantity,
                        priceFinalUSD: item.priceFinalUSD,
                        costUnitUSD: product ? (product.cost + (product.freight || 0)) : 0,
                    };
                }),
                payments: [{
                    id: crypto.randomUUID(),
                    date: new Date().toISOString(),
                    amountUSD: totalUSD,
                    method: paymentMethod,
                    note: `Cotización ${quote.number}`,
                }],
            };

            set(state => ({
                quotes: state.quotes.map(q => q.id === quoteId ? { ...q, status: 'ACCEPTED' as const } : q),
                sales: [newSale, ...state.sales],
                products: state.products.map(p => {
                    const item = quote.items.find(i => i.productId === p.id);
                    return item ? { ...p, stock: Math.max(0, p.stock - item.quantity) } : p;
                }),
            }));

            toast.dismiss(loadingToast);
            toast.success(`✅ Venta creada desde ${quote.number}`);
            return true;
        } catch (err) {
            toast.dismiss(loadingToast);
            toast.error('Error al convertir cotización');
            console.error(err);
            return false;
        }
    },
});
