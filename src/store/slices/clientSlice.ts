/**
 * @file slices/clientSlice.ts
 * @description CRUD de clientes.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { Client } from '../../types';
import type { SetState } from '../types';

export const createClientSlice = (set: SetState) => ({

  clients: [] as Client[],

  addClient: async (client: Client) => {
    try {
      const { data, error } = await supabase.from('clients').insert({
        name: client.name, rif: client.rif, phone: client.phone,
        address: client.address, email: client.email, notes: client.notes,
        credit_limit: client.creditLimit ?? 0,
        price_list: client.priceList ?? null,
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
});
