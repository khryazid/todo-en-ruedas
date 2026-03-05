/**
 * @file slices/expenseSlice.ts
 * @description Gestión de Gastos / Egresos.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { Expense } from '../../types';
import type { SetState, GetState } from '../types';

export const createExpenseSlice = (_set: SetState, get: GetState) => ({

    expenses: [] as Expense[],

    fetchExpenses: async () => {
        const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .order('date', { ascending: false });

        if (error) { console.error('fetchExpenses:', error); return; }

        const mapped: Expense[] = (data || []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            date: r.date as string,
            description: r.description as string,
            amountUSD: Number(r.amount_usd) || 0,
            amountBS: r.amount_bs ? Number(r.amount_bs) : undefined,
            currency: (r.currency as string || 'USD') as import('../../types').ExpenseCurrency,
            category: (r.category as string) || 'Otro',
            paymentMethod: (r.payment_method as string) || 'Efectivo',
            fxRateUsed: r.fx_rate_used ? Number(r.fx_rate_used) : undefined,
            fxSource: r.fx_source as import('../../types').FxSource | undefined,
            userId: r.user_id as string | undefined,
            sellerName: r.seller_name as string | undefined,
            isRecurring: Boolean(r.is_recurring),
            recurringId: r.recurring_id as string | undefined,
        }));

        _set({ expenses: mapped });
    },

    addExpense: async (expense: Omit<Expense, 'id'>) => {
        const { data, error } = await supabase
            .from('expenses')
            .insert({
                date: expense.date,
                description: expense.description,
                amount_usd: expense.amountUSD,
                amount_bs: expense.amountBS || null,
                currency: expense.currency || 'USD',
                category: expense.category,
                payment_method: expense.paymentMethod,
                fx_rate_used: expense.fxRateUsed || null,
                fx_source: expense.fxSource || null,
                user_id: expense.userId || null,
                seller_name: expense.sellerName || null,
                is_recurring: expense.isRecurring || false,
                recurring_id: expense.recurringId || null,
            })
            .select()
            .single();

        if (error) { toast.error('Error al registrar gasto'); console.error(error); return; }

        const newExpense: Expense = {
            id: (data as Record<string, unknown>).id as string,
            date: expense.date,
            description: expense.description,
            amountUSD: expense.amountUSD,
            amountBS: expense.amountBS,
            currency: expense.currency || 'USD',
            category: expense.category,
            paymentMethod: expense.paymentMethod,
            fxRateUsed: expense.fxRateUsed,
            fxSource: expense.fxSource,
            userId: expense.userId,
            sellerName: expense.sellerName,
            isRecurring: expense.isRecurring,
            recurringId: expense.recurringId,
        };

        _set(state => ({ expenses: [newExpense, ...state.expenses] }));

        await get().upsertCashMovementByReference('expense', newExpense.id, {
            date: newExpense.date,
            direction: 'OUT',
            kind: 'GASTO_OPERATIVO',
            amountUSD: newExpense.amountUSD,
            amountBS: newExpense.amountBS,
            currency: newExpense.currency || 'USD',
            paymentMethod: newExpense.paymentMethod,
            description: `Gasto: ${newExpense.description}`,
            userId: newExpense.userId,
            sellerName: newExpense.sellerName,
        });

        toast.success('Gasto registrado');
    },

    updateExpense: async (id: string, updates: Partial<Expense>) => {
        const payload: Record<string, unknown> = {};
        if (updates.description !== undefined) payload.description = updates.description;
        if (updates.amountUSD !== undefined) payload.amount_usd = updates.amountUSD;
        if (updates.amountBS !== undefined) payload.amount_bs = updates.amountBS;
        if (updates.currency !== undefined) payload.currency = updates.currency;
        if (updates.category !== undefined) payload.category = updates.category;
        if (updates.paymentMethod !== undefined) payload.payment_method = updates.paymentMethod;
        if (updates.fxRateUsed !== undefined) payload.fx_rate_used = updates.fxRateUsed;
        if (updates.fxSource !== undefined) payload.fx_source = updates.fxSource;
        if (updates.date !== undefined) payload.date = updates.date;

        const { error } = await supabase.from('expenses').update(payload).eq('id', id);
        if (error) { toast.error('Error al actualizar gasto'); return; }

        const previous = get().expenses.find((expense) => expense.id === id);

        _set(state => ({
            expenses: state.expenses.map(expense => expense.id === id ? { ...expense, ...updates } : expense)
        }));

        const current = get().expenses.find((expense) => expense.id === id);
        const effective = current || (previous ? { ...previous, ...updates } : null);

        if (effective) {
            await get().upsertCashMovementByReference('expense', id, {
                date: effective.date,
                direction: 'OUT',
                kind: 'GASTO_OPERATIVO',
                amountUSD: effective.amountUSD,
                amountBS: effective.amountBS,
                currency: effective.currency || 'USD',
                paymentMethod: effective.paymentMethod,
                description: `Gasto: ${effective.description}`,
                userId: effective.userId,
                sellerName: effective.sellerName,
            });
        }

        toast.success('Gasto actualizado');
    },

    deleteExpense: async (id: string) => {
        if (!window.confirm('¿Eliminar este gasto?')) return;
        const { error } = await supabase.from('expenses').delete().eq('id', id);
        if (error) { toast.error('Error al eliminar gasto'); return; }
        _set(state => ({ expenses: state.expenses.filter(e => e.id !== id) }));

        await get().deleteCashMovementByReference('expense', id);

        toast.success('Gasto eliminado');
    },
});
