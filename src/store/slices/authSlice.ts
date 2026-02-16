/**
 * @file slices/authSlice.ts
 * @description Autenticación y carga inicial de datos.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';

export const createAuthSlice = (set: any, get: any) => ({

  user: null,
  isLoading: true,
  settingsId: null,

  checkSession: async () => {
    set({ isLoading: true });
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      set({ user: session.user });
      await get().fetchInitialData();
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
    toast.success(`Bienvenido de nuevo 👋`);
    await get().fetchInitialData();
    return true;
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, cart: [], products: [], sales: [] });
    toast.success("Sesión cerrada");
  },

  fetchInitialData: async () => {
    if (!get().user) return;
    set({ isLoading: true });
    try {
      const { data: settingsData } = await supabase.from('settings').select('*').single();
      const { data: productsData } = await supabase.from('products').select('*');
      const { data: clientsData } = await supabase.from('clients').select('*');
      const { data: salesData } = await supabase.from('sales').select(`*, sale_items(*), payments(*)`).order('date', { ascending: false }).limit(100);
      const { data: suppliersData } = await supabase.from('suppliers').select('*');
      const { data: invoicesData } = await supabase.from('invoices').select('*');
      const { data: paymentMethodsData } = await supabase.from('payment_methods').select('*');

      if (settingsData) {
        set((state: any) => ({
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
          products: productsData.map((p: any) => ({
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
          paymentMethods: paymentMethodsData.map((pm: any) => ({
            id: pm.id, name: pm.name, currency: pm.currency
          }))
        });
      }

      if (invoicesData) {
        set({
          invoices: invoicesData.map((inv: any) => ({
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
          sales: salesData.map((s: any) => ({
            id: s.id,
            date: s.date,
            clientId: s.client_id,
            totalUSD: s.total_usd,
            totalVED: s.total_ved,
            paymentMethod: s.payment_method,
            status: s.status,
            paidAmountUSD: s.paid_amount_usd,
            isCredit: s.is_credit || false,
            items: s.sale_items.map((i: any) => ({
              sku: i.sku || 'N/A',
              name: i.product_name_snapshot || 'Producto',
              quantity: i.quantity,
              priceFinalUSD: i.unit_price_usd,
              costUnitUSD: i.cost_unit_usd
            })),
            payments: s.payments.map((p: any) => ({
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
