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
    lastCloseDate: undefined,
    defaultMargin: 30, defaultVAT: 16, printerCurrency: 'BS',
    shiftStart: '08:00',
    showSellerCommission: false,
    sellerCommissionPct: 5,
    marginMayorista: 0,
    marginEspecial: 0,
  } as AppSettings,

  paymentMethods: [] as PaymentMethod[],

  fetchSettingsData: async () => {
    try {
      const { data: settingsData } = await supabase.from('settings').select('*').single();
      const { data: paymentMethodsData } = await supabase.from('payment_methods').select('*');

      if (settingsData) {
        set((state) => ({
          settingsId: settingsData.id,
          settings: {
            ...state.settings,
            companyName: settingsData.company_name || 'Glyph Core',
            salePrinterProfile: 'default',
            rif: settingsData.rif.split('-')[1] || settingsData.rif,
            rifType: settingsData.rif.split('-')[0] || 'J',
            address: settingsData.address,
            tasaBCV: settingsData.tasa_bcv,
            tasaTH: settingsData.tasa_monitor,
            showMonitorRate: settingsData.show_monitor_rate,
            lastCloseDate: settingsData.last_close_date || undefined,
            printerCurrency: settingsData.printer_currency,
            defaultMargin: settingsData.default_margin ?? state.settings.defaultMargin,
            defaultVAT: settingsData.default_vat ?? state.settings.defaultVAT,
            shiftStart: settingsData.shift_start || '08:00',
            showSellerCommission: settingsData.show_seller_commission ?? false,
            sellerCommissionPct: settingsData.seller_commission_pct ?? 5,
            marginMayorista: settingsData.margin_mayorista ?? 0,
            marginEspecial: settingsData.margin_especial ?? 0,
          }
        }));
      }

      if (paymentMethodsData && paymentMethodsData.length > 0) {
        set({
          paymentMethods: paymentMethodsData.map((pm) => ({
            id: pm.id,
            name: pm.name,
            currency: pm.currency,
            commissionPct: Number(pm.commission_pct) || 0,
          }))
        });
      }
    } catch (error) {
      console.warn('fetchSettingsData realtime sync:', error);
    }
  },

  updateSettings: async (newSettings: AppSettings) => {
    set({ settings: newSettings });
    try {
      const payload = {
        company_name: newSettings.companyName,
        rif: `${newSettings.rifType}-${newSettings.rif}`,
        address: newSettings.address || '',
        tasa_bcv: newSettings.tasaBCV,
        tasa_monitor: newSettings.tasaTH,
        show_monitor_rate: newSettings.showMonitorRate,
        printer_currency: newSettings.printerCurrency,
        default_margin: newSettings.defaultMargin,
        default_vat: newSettings.defaultVAT,
        shift_start: newSettings.shiftStart || '08:00',
        show_seller_commission: newSettings.showSellerCommission ?? false,
        seller_commission_pct: newSettings.sellerCommissionPct ?? 5,
        margin_mayorista: newSettings.marginMayorista ?? 0,
        margin_especial: newSettings.marginEspecial ?? 0,
      };

      // Intentar UPDATE primero (cuando ya existe una fila)
      const settingsId = get().settingsId;
      let error;
      let affectedRows: { id: string }[] | null = null;

      if (settingsId) {
        const res = await supabase.from('settings').update(payload).eq('id', settingsId).select('id');
        error = res.error;
        affectedRows = res.data;
      } else {
        const res = await supabase.from('settings').update(payload)
          .neq('id', '00000000-0000-0000-0000-000000000000').select('id');
        error = res.error;
        affectedRows = res.data;
      }

      if (error) throw error;

      // Si no había filas (tabla vacía), INSERT la primera fila
      if (!affectedRows || affectedRows.length === 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('settings')
          .insert({
            ...payload,
            last_close_date: new Date(0).toISOString(),
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        if (inserted) set({ settingsId: inserted.id });
      }

      toast.success("Configuración guardada ✅");
    } catch (error: unknown) {
      toast.error("Error al guardar: " + (error as Error).message);
    }
  },

  addPaymentMethod: async (name: string, currency: 'USD' | 'BS', commissionPct = 0) => {
    try {
      const safeCommission = Number.isFinite(commissionPct) ? Math.max(0, commissionPct) : 0;
      const { data, error } = await supabase
        .from('payment_methods')
        .insert({ name, currency, commission_pct: safeCommission })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        set((state) => ({
          paymentMethods: [...state.paymentMethods, {
            id: data.id,
            name: data.name,
            currency: data.currency,
            commissionPct: Number(data.commission_pct) || 0,
          }]
        }));
        toast.success("Método de pago agregado");
      }
    } catch (error: unknown) {
      toast.error("Error al agregar método: " + (error as Error).message);
    }
  },

  updatePaymentMethodCommission: async (id: string, commissionPct: number) => {
    try {
      const safeCommission = Number.isFinite(commissionPct) ? Math.max(0, commissionPct) : 0;
      const { error } = await supabase
        .from('payment_methods')
        .update({ commission_pct: safeCommission })
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        paymentMethods: state.paymentMethods.map((method) =>
          method.id === id
            ? { ...method, commissionPct: safeCommission }
            : method
        )
      }));

      toast.success('Comisión actualizada');
    } catch (error: unknown) {
      toast.error('Error al actualizar comisión: ' + (error as Error).message);
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

  performDailyClose: async (turnData?: { totalUSD: number; totalBs: number; txCount: number }) => {
    const now = new Date().toISOString();
    const { currentUserData, settingsId } = get();
    try {
      // 1. Actualizar last_close_date en settings
      if (settingsId) {
        await supabase.from('settings').update({ last_close_date: now }).eq('id', settingsId);
      } else {
        await supabase.from('settings').update({ last_close_date: now }).neq('id', '00000000-0000-0000-0000-000000000000');
      }

      // 2. ✅ Registrar en historial de cierres y obtener retorno
      const { data: newClose, error } = await supabase.from('cash_closes').insert({
        closed_at: now,
        closed_by: currentUserData?.id || null,
        seller_name: currentUserData?.fullName || null,
        total_usd: turnData?.totalUSD ?? 0,
        total_bs: turnData?.totalBs ?? 0,
        tx_count: turnData?.txCount ?? 0,
      }).select().single();

      if (error) console.error("Error al cerrar caja:", error);

      set((state) => ({ settings: { ...state.settings, lastCloseDate: now } }));
      toast.success('Cierre de caja exitoso 🏁');

      return newClose ? {
        id: newClose.id,
        sequenceNumber: newClose.sequence_number,
        closedAt: newClose.closed_at,
        totalUSD: newClose.total_usd,
        totalBs: newClose.total_bs,
        txCount: newClose.tx_count,
        sellerName: newClose.seller_name || undefined,
        closedBy: newClose.closed_by || undefined
      } : null;
    } catch {
      toast.error('Error al cerrar caja');
      return null;
    }
  },
});
