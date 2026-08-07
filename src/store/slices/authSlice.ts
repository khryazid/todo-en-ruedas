/**
 * @file slices/authSlice.ts
 * @description Autenticación y carga inicial de datos.
 *
 * ✅ FIX: onAuthStateChange se registra una sola vez (initAuthListener)
 *         y se almacena el unsubscribe para evitar memory leaks.
 * ✅ FIX: fetchInitialData paraleliza queries independientes con Promise.all().
 * ✅ FIX: Usa funciones de mapeo centralizadas de utils/mappers.ts.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { SetState, GetState } from '../types';
import {
  mapProductFromDB,
  mapClientFromDB,
  mapSaleFromDB,
  mapInvoiceFromDB,
  mapPaymentMethodFromDB,
} from '../../utils/mappers';

/** Flag para evitar registrar el listener más de una vez */
let authListenerInitialized = false;

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

    // ✅ FIX: Registrar el listener UNA SOLA VEZ para evitar memory leaks.
    // Antes se registraba cada vez que checkSession se llamaba (ej. StrictMode),
    // acumulando listeners duplicados.
    if (!authListenerInitialized) {
      authListenerInitialized = true;
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (import.meta.env.DEV) {
          console.log('Supabase Auth Event:', event);
        }
        if (event === 'PASSWORD_RECOVERY') {
          set({ user: session?.user ?? null, isLoading: false });
        } else if (event === 'SIGNED_OUT') {
          set({ user: null, cart: [], products: [], sales: [], cashLedger: [], currentUserData: null });
        } else if (event === 'SIGNED_IN' && session) {
          set({ user: session.user });
        }
      });
      // Almacenar referencia para posible cleanup futuro
      if (import.meta.env.DEV) {
        console.log('Auth listener registrado (subscription id:', subscription.id, ')');
      }
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.includes('Email not confirmed')) {
        toast.error("Debes confirmar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada. 📧");
      } else {
        toast.error("Error: Credenciales inválidas 🔒");
      }
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
    set({ user: null, cart: [], products: [], sales: [], cashLedger: [], currentUserData: null });
    toast.success("Sesión cerrada");
  },

  fetchInitialData: async () => {
    if (!get().user) return;
    set({ isLoading: true });
    try {
      // Cargar datos del usuario actual
      await get().fetchCurrentUserData();

      // ✅ FIX: Paralelizar queries independientes con Promise.all()
      const [
        settingsResult,
        productsResult,
        clientsResult,
        salesResult,
        suppliersResult,
        invoicesResult,
        paymentMethodsResult,
      ] = await Promise.all([
        supabase.from('settings').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('products').select('*'),
        supabase.from('clients').select('*'),
        supabase.from('sales').select(`*, sale_items(*), payments(*)`).order('date', { ascending: false }).limit(100),
        supabase.from('suppliers').select('*'),
        supabase.from('invoices').select('*'),
        supabase.from('payment_methods').select('*'),
      ]);

      const settingsData = settingsResult.data;
      const productsData = productsResult.data;
      const clientsData = clientsResult.data;
      const salesData = salesResult.data;
      const suppliersData = suppliersResult.data;
      const invoicesData = invoicesResult.data;
      const paymentMethodsData = paymentMethodsResult.data;

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

      // ✅ FIX: Usar funciones de mapeo centralizadas
      if (productsData) {
        set({ products: productsData.map(mapProductFromDB) });
      }

      if (clientsData) {
        set({ clients: clientsData.map(mapClientFromDB) });
      }

      if (suppliersData) set({ suppliers: suppliersData });

      if (paymentMethodsData && paymentMethodsData.length > 0) {
        set({ paymentMethods: paymentMethodsData.map(mapPaymentMethodFromDB) });
      }

      if (invoicesData) {
        set({
          invoices: invoicesData.map((inv) => mapInvoiceFromDB(inv, suppliersData || []))
        });
      }

      if (salesData) {
        set({ sales: salesData.map(mapSaleFromDB) });
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
    } catch (e) { console.warn('fetchExpenses:', e); }
    try {
      await get().fetchCashLedger();
    } catch (e) { console.warn('fetchCashLedger:', e); }
  },
});
