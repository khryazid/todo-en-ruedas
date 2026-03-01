/**
 * @file store/slices/quoteSlice.ts
 * @description Gestión de Cotizaciones (Quotes): CRUD local + persistencia en Supabase.
 */

import toast from 'react-hot-toast';
import { supabase } from '../../supabase/client';
import type { SetState, GetState } from '../types';
import type { Quote, QuoteItem } from '../../types';

export interface QuoteSlice {
    quotes: Quote[];
    fetchQuotes: () => Promise<void>;
    addQuote: (quote: Quote) => Promise<void>;
    updateQuote: (id: string, updates: Partial<Quote>) => Promise<void>;
    deleteQuote: (id: string) => Promise<void>;
}

export const createQuoteSlice = (set: SetState, get: GetState): QuoteSlice => ({
    quotes: [],

    fetchQuotes: async () => {
        const { data, error } = await supabase
            .from('quotes')
            .select('*')
            .order('date', { ascending: false });

        if (error) { console.error('Error fetching quotes:', error); return; }

        const mapped: Quote[] = (data || []).map((r: any) => ({
            id: r.id,
            number: r.number,
            date: r.date,
            validUntil: r.valid_until,
            clientId: r.client_id,
            clientName: r.client_name,
            items: r.items || [],
            totalUSD: r.total_usd,
            totalBs: r.total_bs,
            notes: r.notes,
            status: r.status,
            userId: r.user_id,
            sellerName: r.seller_name,
        }));

        set({ quotes: mapped });
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
});
