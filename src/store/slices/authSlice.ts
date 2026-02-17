/**
 * @file slices/authSlice.ts
 * @description Autenticación y carga inicial de datos.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { SetState, GetState } from '../types';

export const createAuthSlice = (set: SetState, get: GetState) => ({

  user: null,
  isLoading: true,
  settingsId: null,

  checkSession: async () => {
    set({ isLoading: true });
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      set({ user: session.user });

      // Actualizar last_login
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', session.user.id);

      // CRÍTICO: Cargar datos del usuario actual primero
      await get().fetchCurrentUserData();
      // Luego intentar cargar datos iniciales (puede fallar si no hay settings)
      try {
        await get().fetchInitialData();
      } catch (error) {
        console.warn('Error al cargar datos iniciales (no crítico):', error);
        set({ isLoading: false });
      }
    } else {
      set({ user: null, isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("Error: Credenciales inválidas 🔒");
      set({ isLoading: false });
      return false;
    }
    set({ user: data.user });

    // Actualizar last_login en la base de datos
    if (data.user) {
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id);
    }

    toast.success(`Bienvenido de nuevo 👋`);
    await get().fetchInitialData();
    return true;
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, cart: [], products: [], sales: [], currentUserData: null });
    toast.success("Sesión cerrada");
  },

  fetchInitialData: async () => {
    if (!get().user) return;
    set({ isLoading: true });
    try {
      // Cargar datos del usuario actual
      await get().fetchCurrentUserData();

      const { data: settingsData } = await supabase.from('settings').select('*').single();
      const { data: productsData } = await supabase.from('products').select('*');
      const { data: clientsData } = await supabase.from('clients').select('*');
      const { data: salesData } = await supabase.from('sales').select(`*, sale_items(*), payments(*)`).order('date', { ascending: false }).limit(100);
      const { data: suppliersData } = await supabase.from('suppliers').select('*');
      const { data: invoicesData } = await supabase.from('invoices').select('*');
      const { data: paymentMethodsData } = await supabase.from('payment_methods').select('*');

      if (settingsData) {
        set((state) => ({
          settingsId: settingsData.id,
          settings: {
            ...state.settings,
            companyName: settingsData.company_name,
            rif: settingsData.rif.split('-')[1] || settingsData.rif,
            rifType: settingsData.rif.split('-')[0] || 'J',
            address: settingsData.address,
            tasaBCV: settingsData.tasa_bcv,
            tasaTH: settingsData.tasa_monitor,
            showMonitorRate: settingsData.show_monitor_rate,
            lastCloseDate: settingsData.last_close_date,
            printerCurrency: settingsData.printer_currency
          }
        }));
      }

      if (productsData) {
        set({
          products: productsData.map((p) => ({
            id: p.id, sku: p.sku, name: p.name, category: p.category || 'General',
            stock: Number(p.stock) || 0, minStock: Number(p.min_stock) || 0, cost: Number(p.cost) || 0,
            costType: p.cost_type || 'BCV', freight: Number(p.freight) || 0, supplier: p.supplier || 'General'
          }))
        });
      }

      if (clientsData) set({ clients: clientsData });
      if (suppliersData) set({ suppliers: suppliersData });

      if (paymentMethodsData && paymentMethodsData.length > 0) {
        set({
          paymentMethods: paymentMethodsData.map((pm) => ({
            id: pm.id, name: pm.name, currency: pm.currency
          }))
        });
      }

      if (invoicesData) {
        set({
          invoices: invoicesData.map((inv) => ({
            ...inv,
            subtotalUSD: inv.subtotal_usd,
            freightTotalUSD: inv.freight_total_usd,
            totalUSD: inv.total_usd,
            paidAmountUSD: inv.paid_amount_usd,
            dateIssue: inv.date_issue,
            dateDue: inv.date_due,
            payments: inv.payments || []
          }))
        });
      }

      if (salesData) {
        set({
          sales: salesData.map((s) => ({
            id: s.id,
            date: s.date,
            clientId: s.client_id,
            totalUSD: s.total_usd,
            totalVED: s.total_ved,
            paymentMethod: s.payment_method,
            status: s.status,
            paidAmountUSD: s.paid_amount_usd,
            isCredit: s.is_credit || false,
            items: s.sale_items.map((i: Record<string, unknown>) => ({
              sku: i.sku || 'N/A',
              name: i.product_name_snapshot || 'Producto',
              quantity: i.quantity,
              priceFinalUSD: i.unit_price_usd,
              costUnitUSD: i.cost_unit_usd
            })),
            payments: s.payments.map((p: Record<string, unknown>) => ({
              id: p.id, date: p.created_at,
              amountUSD: p.amount_usd, method: p.method, note: p.note
            }))
          }))
        });
      }

    } catch (error) {
      toast.error('Error de conexión al cargar datos');
    } finally {
      set({ isLoading: false });
    }
  },
});
