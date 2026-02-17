/**
 * @file slices/settingsSlice.ts
 * @description Configuración global, métodos de pago y cierre de caja.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { AppSettings, PaymentMethod } from '../../types';
import type { SetState, GetState } from '../types';

export const createSettingsSlice = (set: SetState, get: GetState) => ({

  settings: {
    companyName: 'Cargando...',
    rif: '', rifType: 'J', address: '',
    tasaBCV: 0, tasaTH: 0, showMonitorRate: true,
    lastUpdated: new Date().toISOString(),
    lastCloseDate: new Date(0).toISOString(),
    defaultMargin: 30, defaultVAT: 16, printerCurrency: 'BS'
  } as AppSettings,

  paymentMethods: [] as PaymentMethod[],

  updateSettings: async (newSettings: AppSettings) => {
    set({ settings: newSettings });
    try {
      const settingsId = get().settingsId;

      if (!settingsId) {
        const { data } = await supabase.from('settings').select('id').single();
        if (data) set({ settingsId: data.id });
      }

      const { error } = await supabase.from('settings').update({
        company_name: newSettings.companyName,
        rif: `${newSettings.rifType}-${newSettings.rif}`,
        address: newSettings.address,
        tasa_bcv: newSettings.tasaBCV,
        tasa_monitor: newSettings.tasaTH,
        show_monitor_rate: newSettings.showMonitorRate,
        printer_currency: newSettings.printerCurrency
      }).eq('id', get().settingsId);

      if (error) throw error;
      toast.success("Configuración guardada");
    } catch (error: unknown) {
      toast.error("Error al guardar: " + (error as Error).message);
    }
  },

  addPaymentMethod: async (name: string, currency: 'USD' | 'BS') => {
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .insert({ name, currency })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        set((state) => ({
          paymentMethods: [...state.paymentMethods, { id: data.id, name: data.name, currency: data.currency }]
        }));
        toast.success("Método de pago agregado");
      }
    } catch (error: unknown) {
      toast.error("Error al agregar método: " + (error as Error).message);
    }
  },

  deletePaymentMethod: async (id: string) => {
    try {
      const { error } = await supabase
        .from('payment_methods')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        paymentMethods: state.paymentMethods.filter((pm) => pm.id !== id)
      }));
      toast.success("Método de pago eliminado");
    } catch (error: unknown) {
      toast.error("Error al eliminar método: " + (error as Error).message);
    }
  },

  performDailyClose: async () => {
    const now = new Date().toISOString();
    try {
      const settingsId = get().settingsId;
      if (settingsId) {
        await supabase.from('settings').update({ last_close_date: now }).eq('id', settingsId);
      } else {
        await supabase.from('settings').update({ last_close_date: now }).neq('id', '00000000-0000-0000-0000-000000000000');
      }
      set((state) => ({ settings: { ...state.settings, lastCloseDate: now } }));
      toast.success("Cierre de caja exitoso 🏁");
    } catch (error) {
      toast.error("Error al cerrar caja");
    }
  },
});
