/**
 * @file slices/clientSlice.ts
 * @description CRUD de clientes.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { Client } from '../../types';

export const createClientSlice = (set: any, get: any) => ({

  clients: [] as Client[],

  addClient: async (client: Client) => {
    try {
      const { data, error } = await supabase.from('clients').insert({
        name: client.name, rif: client.rif, phone: client.phone,
        address: client.address, email: client.email, notes: client.notes
      }).select().single();
      if (error) throw error;
      if (data) {
        set((state: any) => ({ clients: [...state.clients, { ...client, id: data.id }] }));
        toast.success("Cliente registrado");
      }
    } catch (error: any) {
      toast.error("Error: " + error.message);
    }
  },

  updateClient: async (id: string, updates: Partial<Client>) => {
    try {
      const { error } = await supabase.from('clients').update(updates).eq('id', id);
      if (error) throw error;
      set((state: any) => ({ clients: state.clients.map((c: any) => c.id === id ? { ...c, ...updates } : c) }));
      toast.success("Cliente actualizado");
    } catch (error: any) {
      toast.error("Error: " + error.message);
    }
  },

  deleteClient: async (id: string) => {
    try {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      set((state: any) => ({ clients: state.clients.filter((c: any) => c.id !== id) }));
      toast.success("Cliente eliminado");
    } catch (error: any) {
      toast.error("Error: " + error.message);
    }
  },
});
