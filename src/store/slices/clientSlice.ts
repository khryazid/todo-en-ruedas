/**
 * @file slices/clientSlice.ts
 * @description CRUD de clientes.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { Client } from '../../types';
import type { SetState, GetState } from '../types';

export const createClientSlice = (set: SetState, get: GetState) => ({

  clients: [] as Client[],

  addClient: async (client: Client) => {
    try {
      const { data, error } = await supabase.from('clients').insert({
        name: client.name, rif: client.rif, phone: client.phone,
        address: client.address, email: client.email, notes: client.notes,
        credit_limit: client.creditLimit ?? 0,
        price_list: client.priceList ?? null,
        credit_balance: client.creditBalance ?? 0,
      }).select().single();
      if (error) throw error;
      if (data) {
        set((state) => ({ clients: [...state.clients, { ...client, id: data.id }] }));
        toast.success("Cliente registrado");
      }
    } catch (error: unknown) {
      toast.error("Error: " + (error as Error).message);
    }
  },

  updateClient: async (id: string, updates: Partial<Client>) => {
    try {
      const payload: Record<string, unknown> = { ...updates };
      if ('creditLimit' in updates) {
        payload.credit_limit = updates.creditLimit ?? 0;
        delete payload.creditLimit;
      }
      if ('priceList' in updates) {
        payload.price_list = updates.priceList ?? null;
        delete payload.priceList;
      }
      if ('creditBalance' in updates) {
        payload.credit_balance = updates.creditBalance ?? 0;
        delete payload.creditBalance;
      }
      const { error } = await supabase.from('clients').update(payload).eq('id', id);
      if (error) throw error;
      set((state) => ({ clients: state.clients.map((c) => c.id === id ? { ...c, ...updates } : c) }));
      toast.success("Cliente actualizado");
    } catch (error: unknown) {
      toast.error("Error: " + (error as Error).message);
    }
  },

  deleteClient: async (id: string) => {
    try {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      set((state) => ({ clients: state.clients.filter((c) => c.id !== id) }));
      toast.success("Cliente eliminado");
    } catch (error: unknown) {
      toast.error("Error: " + (error as Error).message);
    }
  },

  applyClientCredit: async (clientId: string, delta: number) => {
    // delta > 0 = add credit, delta < 0 = deduct credit
    const client = get().clients.find(c => c.id === clientId);
    if (!client) return;
    const newBalance = Math.max(0, (client.creditBalance ?? 0) + delta);
    try {
      const { error } = await supabase.from('clients').update({ credit_balance: newBalance }).eq('id', clientId);
      if (error) throw error;
      set(state => ({ clients: state.clients.map(c => c.id === clientId ? { ...c, creditBalance: newBalance } : c) }));
    } catch (err) {
      console.error('applyClientCredit:', err);
    }
  },
});
