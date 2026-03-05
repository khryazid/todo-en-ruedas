import { supabase } from '../../supabase/client';
import type { CashLedgerEntry } from '../../types';
import type { SetState } from '../types';

const mapLedgerRow = (row: Record<string, unknown>): CashLedgerEntry => ({
  id: row.id as string,
  date: (row.date as string) || new Date().toISOString(),
  direction: (row.direction as 'IN' | 'OUT') || 'OUT',
  kind: (row.kind as CashLedgerEntry['kind']) || 'AJUSTE',
  amountUSD: Number(row.amount_usd) || 0,
  amountBS: row.amount_bs !== null && row.amount_bs !== undefined ? Number(row.amount_bs) : undefined,
  currency: ((row.currency as 'USD' | 'BS') || 'USD'),
  paymentMethod: (row.payment_method as string) || 'N/A',
  description: (row.description as string) || '',
  referenceType: (row.reference_type as string) || undefined,
  referenceId: (row.reference_id as string) || undefined,
  userId: (row.user_id as string) || undefined,
  sellerName: (row.seller_name as string) || undefined,
  createdAt: (row.created_at as string) || new Date().toISOString(),
});

export const createCashLedgerSlice = (set: SetState) => ({
  cashLedger: [] as CashLedgerEntry[],

  fetchCashLedger: async () => {
    const { data, error } = await supabase
      .from('cash_ledger')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('fetchCashLedger:', error);
      return;
    }

    const mapped = (data || []).map((row: Record<string, unknown>) => mapLedgerRow(row));
    set({ cashLedger: mapped });
  },

  recordCashMovement: async (entry: {
    date: string;
    direction: 'IN' | 'OUT';
    kind: 'VENTA_COBRADA' | 'ABONO_CLIENTE' | 'ABONO_PROVEEDOR' | 'GASTO_OPERATIVO' | 'AJUSTE';
    amountUSD: number;
    amountBS?: number;
    currency: 'USD' | 'BS';
    paymentMethod: string;
    description: string;
    referenceType?: string;
    referenceId?: string;
    userId?: string;
    sellerName?: string;
  }) => {
    const { data, error } = await supabase
      .from('cash_ledger')
      .insert({
        date: entry.date,
        direction: entry.direction,
        kind: entry.kind,
        amount_usd: entry.amountUSD,
        amount_bs: entry.amountBS ?? null,
        currency: entry.currency,
        payment_method: entry.paymentMethod,
        description: entry.description,
        reference_type: entry.referenceType ?? null,
        reference_id: entry.referenceId ?? null,
        user_id: entry.userId ?? null,
        seller_name: entry.sellerName ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('recordCashMovement:', error);
      return null;
    }

    const mapped = mapLedgerRow(data as Record<string, unknown>);
    set((state) => ({ cashLedger: [mapped, ...state.cashLedger] }));
    return mapped;
  },

  upsertCashMovementByReference: async (
    referenceType: string,
    referenceId: string,
    entry: {
      date: string;
      direction: 'IN' | 'OUT';
      kind: 'VENTA_COBRADA' | 'ABONO_CLIENTE' | 'ABONO_PROVEEDOR' | 'GASTO_OPERATIVO' | 'AJUSTE';
      amountUSD: number;
      amountBS?: number;
      currency: 'USD' | 'BS';
      paymentMethod: string;
      description: string;
      userId?: string;
      sellerName?: string;
    }
  ) => {
    const payload = {
      date: entry.date,
      direction: entry.direction,
      kind: entry.kind,
      amount_usd: entry.amountUSD,
      amount_bs: entry.amountBS ?? null,
      currency: entry.currency,
      payment_method: entry.paymentMethod,
      description: entry.description,
      reference_type: referenceType,
      reference_id: referenceId,
      user_id: entry.userId ?? null,
      seller_name: entry.sellerName ?? null,
    };

    const { data: existing } = await supabase
      .from('cash_ledger')
      .select('id')
      .eq('reference_type', referenceType)
      .eq('reference_id', referenceId)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await supabase
        .from('cash_ledger')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('upsertCashMovementByReference(update):', error);
        return null;
      }

      const mapped = mapLedgerRow(data as Record<string, unknown>);
      set((state) => ({
        cashLedger: state.cashLedger.map((movement) => movement.id === mapped.id ? mapped : movement),
      }));
      return mapped;
    }

    const { data, error } = await supabase
      .from('cash_ledger')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('upsertCashMovementByReference(insert):', error);
      return null;
    }

    const mapped = mapLedgerRow(data as Record<string, unknown>);
    set((state) => ({ cashLedger: [mapped, ...state.cashLedger] }));
    return mapped;
  },

  deleteCashMovementByReference: async (referenceType: string, referenceId: string) => {
    const { error } = await supabase
      .from('cash_ledger')
      .delete()
      .eq('reference_type', referenceType)
      .eq('reference_id', referenceId);

    if (error) {
      console.error('deleteCashMovementByReference:', error);
      return;
    }

    set((state) => ({
      cashLedger: state.cashLedger.filter((movement) => !(movement.referenceType === referenceType && movement.referenceId === referenceId)),
    }));
  },
});
