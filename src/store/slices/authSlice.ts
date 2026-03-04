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
      try {
        await get().fetchInitialData();
      } catch (error) {
        console.warn('Error al cargar datos iniciales (no crítico):', error);
        set({ isLoading: false });
      }
    } else {
      set({ user: null, isLoading: false });
    }

    // Escuchar cambios de estado (como cuando el usuario hace clic en el enlace de recuperación y Supabase procesa el token detrás de escena)
    supabase.auth.onAuthStateChange((event, session) => {
      console.log('Supabase Auth Event:', event);
      if (event === 'PASSWORD_RECOVERY') {
        // En este punto, Supabase verificó el token y creó una sesión temporal.
        // Permitiremos que el usuario siga a /reset-password.
        set({ user: session?.user ?? null, isLoading: false });
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, cart: [], products: [], sales: [], currentUserData: null });
      } else if (event === 'SIGNED_IN' && session) {
        set({ user: session.user });
      }
    });

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

  sendPasswordResetEmail: async (email: string) => {
    set({ isLoading: true });

    // Configura redirect_to con la URL actual dinámica + /reset-password
    const redirectUrl = `${window.location.origin}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });

    set({ isLoading: false });

    if (error) {
      console.error('Error enviando email recovery:', error);
      toast.error(`No se pudo enviar el correo: ${error.message}`);
      return false;
    }

    toast.success('Te hemos enviado un enlace de recuperación al correo.');
    return true;
  },

  updateRecoveredPassword: async (newPassword: string) => {
    set({ isLoading: true });
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    set({ isLoading: false });

    if (error) {
      console.error('Error al actualizar contraseña recuperada:', error);
      toast.error(`Error al guardar: ${error.message}`);
      return false;
    }

    toast.success('Tu contraseña se ha restablecido correctamente.');
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

      if (productsData) {
        set({
          products: productsData.map((p) => ({
            id: p.id, sku: p.sku, name: p.name, category: p.category || 'General',
            stock: Number(p.stock) || 0, minStock: Number(p.min_stock) || 0, cost: Number(p.cost) || 0,
            costType: p.cost_type || 'BCV', freight: Number(p.freight) || 0, supplier: p.supplier || 'General'
          }))
        });
      }

      if (clientsData) set({
        clients: clientsData.map((c) => ({
          id: c.id,
          name: c.name,
          rif: c.rif,
          phone: c.phone ?? undefined,
          address: c.address ?? undefined,
          email: c.email ?? undefined,
          notes: c.notes ?? undefined,
          creditLimit: c.credit_limit ? Number(c.credit_limit) : undefined,
          priceList: c.price_list ?? undefined,
          creditBalance: c.credit_balance ? Number(c.credit_balance) : 0,
        }))
      });
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
            localId: s.local_id,
            date: s.date,
            clientId: s.client_id,
            totalUSD: s.total_usd,
            totalVED: s.total_ved,
            paymentMethod: s.payment_method,
            status: s.status,
            paidAmountUSD: s.paid_amount_usd,
            isCredit: s.is_credit || false,
            // ✅ FIX: Mapear datos del vendedor para que el Dashboard del SELLER
            // pueda filtrar sus ventas propias correctamente
            userId: s.user_id || undefined,
            sellerName: s.seller_name || undefined,
            items: (s.sale_items || []).map((i: Record<string, unknown>) => ({
              sku: i.sku || 'N/A',
              name: i.product_name_snapshot || 'Producto',
              quantity: i.quantity,
              priceFinalUSD: i.unit_price_usd,
              costUnitUSD: i.cost_unit_usd
            })),
            payments: (s.payments || []).map((p: Record<string, unknown>) => ({
              id: p.id, date: p.created_at,
              amountUSD: p.amount_usd, method: p.method, note: p.note
            }))
          }))
        });
      }

    } catch (error) {
      console.error("❌ ERROR CARGANDO DATOS INICIALES:", error);
      toast.error('Error de conexión al cargar datos');
    } finally {
      set({ isLoading: false });
    }

    // Cargar cotizaciones y gastos (no críticos — fallar silenciosamente)
    try {
      await get().fetchQuotes();
    } catch (e) { console.warn('fetchQuotes:', e); }
    try {
      await get().fetchExpenses();

      // ✅ FUNCIONALIDAD PENDIENTE IMPLEMENTADA: Alerta de gastos recurrentes al iniciar sesión
      const expenses = get().expenses;
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      // Buscamos gastos que estén marcados como recurrentes
      const recurringExpensesDef = expenses.filter(e => e.isRecurring);

      // Filtramos cuáles de esos gastos NO han sido pagados este mes
      const unpaidRecurring = recurringExpensesDef.filter(recurring => {
        // Buscamos si existe un pago para esta categoría recurrente en el mes actual
        const hasPaidThisMonth = expenses.some(e => {
          const expenseDate = new Date(e.date);
          return e.category === recurring.category &&
            expenseDate.getMonth() === currentMonth &&
            expenseDate.getFullYear() === currentYear &&
            e.id !== recurring.id; // Asegurarse de no contarse a sí mismo si ya se registró hoy
        });
        return !hasPaidThisMonth;
      });

      if (unpaidRecurring.length > 0) {
        const uniqueCategories = Array.from(new Set(unpaidRecurring.map(e => e.category)));
        toast('Tienes gastos recurrentes pendientes este mes:\n' + uniqueCategories.join(', '), {
          icon: '🗓️',
          duration: 8000
        });
      }

    } catch (e) { console.warn('fetchExpenses:', e); }
  },
});
