/**
 * @file useStore.ts
 * @description Store central de Zustand — "El Cerebro" del sistema.
 *
 * ✅ SPRINT 1 FIXES APLICADOS:
 *   1.2 — Métodos de pago persistidos en Supabase (async)
 *   1.3 — user tipado como User de Supabase (no any)
 *   1.4 — Eliminados fetchInitialData() redundantes en addProduct/updateProduct
 *   BONUS — settingsId cacheado para evitar query extra en updateSettings
 */

import { create } from 'zustand';
import { supabase } from '../supabase/client';
import toast from 'react-hot-toast';
import type { User } from '@supabase/supabase-js'; // ✅ FIX 1.3
import type {
  Product, CartItem, Sale, Invoice, Payment, AppSettings,
  Supplier, PaymentMethod, Client, SaleStatus
} from '../types';

// =============================================
// INTERFAZ DEL STORE
// =============================================
interface StoreState {
  user: User | null; // ✅ FIX 1.3: Era `any | null`
  isLoading: boolean;
  settingsId: string | null; // ✅ BONUS: Cache del ID de settings
  settings: AppSettings;
  products: Product[];
  cart: CartItem[];
  sales: Sale[];
  invoices: Invoice[];
  suppliers: Supplier[];
  clients: Client[];
  paymentMethods: PaymentMethod[];

  // Auth
  checkSession: () => Promise<void>;
  login: (email: string, pass: string) => Promise<boolean>;
  logout: () => Promise<void>;

  // Data
  fetchInitialData: () => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;

  // Productos
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  // Clientes
  addClient: (client: Client) => Promise<void>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;

  // Carrito
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  // Ventas
  completeSale: (paymentMethod: string, clientId?: string, initialPayment?: number) => Promise<void>;
  annulSale: (saleId: string) => Promise<void>;
  deleteSale: (saleId: string) => Promise<void>;
  registerSalePayment: (saleId: string, payment: Payment) => Promise<void>;

  // Facturas de Compra
  addInvoice: (invoice: Invoice) => Promise<boolean>;
  updateInvoice: (invoice: Invoice) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  registerPayment: (invoiceId: string, payment: Payment) => Promise<void>;

  // Métodos de Pago — ✅ FIX 1.2: Ahora son async
  addPaymentMethod: (name: string, currency: 'USD' | 'BS') => Promise<void>;
  deletePaymentMethod: (id: string) => Promise<void>;

  // Caja
  performDailyClose: () => Promise<void>;
}

// =============================================
// STORE
// =============================================
export const useStore = create<StoreState>((set, get) => ({

  // --- ESTADO INICIAL ---
  user: null,
  isLoading: true,
  settingsId: null, // ✅ BONUS

  settings: {
    companyName: 'Cargando...',
    rif: '', rifType: 'J', address: '',
    tasaBCV: 0, tasaTH: 0, showMonitorRate: true,
    lastUpdated: new Date().toISOString(),
    lastCloseDate: new Date(0).toISOString(),
    defaultMargin: 30, defaultVAT: 16, printerCurrency: 'BS'
  },

  products: [], cart: [], sales: [], invoices: [], suppliers: [], clients: [],

  // ✅ FIX 1.2: Métodos de pago iniciales vacíos (se cargan desde Supabase)
  paymentMethods: [],

  // =============================================
  // AUTH
  // =============================================

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

  login: async (email, password) => {
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

  // =============================================
  // CARGA DE DATOS
  // =============================================

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
      const { data: paymentMethodsData } = await supabase.from('payment_methods').select('*'); // ✅ FIX 1.2

      if (settingsData) {
        set((state) => ({
          settingsId: settingsData.id, // ✅ BONUS: Cacheamos el ID
          settings: {
            ...state.settings,
            companyName: settingsData.company_name,
            rif: settingsData.rif.split('-')[1] || settingsData.rif,
            rifType: (settingsData.rif.split('-')[0] || 'J') as any,
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

      // ✅ FIX 1.2: Cargar métodos de pago desde Supabase
      if (paymentMethodsData && paymentMethodsData.length > 0) {
        set({
          paymentMethods: paymentMethodsData.map((pm: any) => ({
            id: pm.id,
            name: pm.name,
            currency: pm.currency
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
            id: s.id, date: s.date, clientId: s.client_id,
            totalUSD: s.total_usd, totalVED: s.total_ved,
            paymentMethod: s.payment_method, status: s.status,
            paidAmountUSD: s.paid_amount_usd,
            items: s.sale_items.map((i: any) => ({
              sku: 'N/A', // TODO Sprint 3.2: Leer SKU real
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

  // =============================================
  // CONFIGURACIÓN
  // =============================================

  updateSettings: async (newSettings) => {
    set({ settings: newSettings });
    try {
      const settingsId = get().settingsId; // ✅ BONUS: Usamos el ID cacheado

      if (!settingsId) {
        // Fallback: si por alguna razón no tenemos el ID, lo buscamos
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
    } catch (error: any) {
      toast.error("Error al guardar: " + error.message);
    }
  },

  // =============================================
  // PRODUCTOS
  // =============================================

  addProduct: async (product) => {
    try {
      const { data, error } = await supabase.from('products').insert({
        sku: product.sku, name: product.name, category: product.category,
        stock: product.stock, min_stock: product.minStock, cost: product.cost,
        cost_type: product.costType, freight: product.freight, supplier: product.supplier
      }).select().single();

      if (error) throw error;

      if (product.supplier && product.supplier !== 'General') {
        const existingSupplier = get().suppliers.find(s => s.name.toLowerCase() === product.supplier!.toLowerCase());
        if (!existingSupplier) await supabase.from('suppliers').insert({ name: product.supplier, catalog: [] });
      }

      if (data) {
        set(state => ({ products: [...state.products, { ...product, id: data.id }] }));
        // ✅ FIX 1.4: Eliminado get().fetchInitialData() — ya actualizamos el state local arriba
        toast.success("Producto agregado");
      }
    } catch (error: any) {
      toast.error("Error: " + error.message);
    }
  },

  updateProduct: async (id, updates) => {
    try {
      const dbUpdates: any = {};

      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.stock !== undefined) dbUpdates.stock = updates.stock;
      if (updates.cost !== undefined) dbUpdates.cost = updates.cost;
      if (updates.minStock !== undefined) dbUpdates.min_stock = updates.minStock;
      if (updates.category !== undefined) dbUpdates.category = updates.category;
      if (updates.supplier !== undefined) dbUpdates.supplier = updates.supplier;
      if (updates.costType !== undefined) dbUpdates.cost_type = updates.costType;
      if (updates.freight !== undefined) dbUpdates.freight = updates.freight;

      const { error } = await supabase.from('products').update(dbUpdates).eq('id', id);
      if (error) throw error;

      if (updates.supplier && updates.supplier !== 'General') {
        const existingSupplier = get().suppliers.find(s => s.name.toLowerCase() === updates.supplier!.toLowerCase());
        if (!existingSupplier) await supabase.from('suppliers').insert({ name: updates.supplier, catalog: [] });
      }

      set(state => ({ products: state.products.map(p => p.id === id ? { ...p, ...updates } : p) }));
      // ✅ FIX 1.4: Eliminado get().fetchInitialData() — ya actualizamos el state local arriba
      toast.success("Producto actualizado");
    } catch (error: any) {
      toast.error("Error al actualizar: " + error.message);
    }
  },

  deleteProduct: async (id) => {
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);

      if (error) {
        if (error.code === '23503' || error.message.includes('foreign key constraint')) {
          throw new Error("No puedes borrar un producto que ya tiene ventas en el historial. Déjalo en Stock 0 o edita su nombre.");
        }
        throw error;
      }

      set(state => ({ products: state.products.filter(p => p.id !== id) }));
      toast.success("Producto eliminado");
    } catch (error: any) {
      toast.error(error.message, { duration: 6000 });
    }
  },

  // =============================================
  // CLIENTES
  // =============================================

  addClient: async (client) => {
    try {
      const { data, error } = await supabase.from('clients').insert({
        name: client.name, rif: client.rif, phone: client.phone,
        address: client.address, email: client.email, notes: client.notes
      }).select().single();
      if (error) throw error;
      if (data) {
        set(state => ({ clients: [...state.clients, { ...client, id: data.id }] }));
        toast.success("Cliente registrado");
      }
    } catch (error: any) {
      toast.error("Error: " + error.message);
    }
  },

  updateClient: async (id, updates) => {
    try {
      const { error } = await supabase.from('clients').update(updates).eq('id', id);
      if (error) throw error;
      set(state => ({ clients: state.clients.map(c => c.id === id ? { ...c, ...updates } : c) }));
      toast.success("Cliente actualizado");
    } catch (error: any) {
      toast.error("Error: " + error.message);
    }
  },

  deleteClient: async (id) => {
    try {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      set(state => ({ clients: state.clients.filter(c => c.id !== id) }));
      toast.success("Cliente eliminado");
    } catch (error: any) {
      toast.error("Error: " + error.message);
    }
  },

  // =============================================
  // CARRITO
  // =============================================

  addToCart: (product) => set((state) => {
    const existing = state.cart.find((item) => item.id === product.id);
    const costBase = product.cost + (product.freight || 0);
    const margin = product.customMargin ?? state.settings.defaultMargin;
    const vat = product.customVAT ?? state.settings.defaultVAT;

    const basePrice = Math.round((costBase * (1 + margin / 100) * (1 + vat / 100)) * 100) / 100;
    let priceFinalUSD = basePrice;

    if (product.costType === 'TH') {
      priceFinalUSD = (basePrice * state.settings.tasaTH) / state.settings.tasaBCV;
    }
    priceFinalUSD = Math.round(priceFinalUSD * 100) / 100;

    if (existing) {
      return { cart: state.cart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) };
    }
    return { cart: [...state.cart, { ...product, quantity: 1, priceFinalUSD }] };
  }),

  removeFromCart: (id) => set((state) => ({
    cart: state.cart.filter((item) => item.id !== id)
  })),

  updateCartQuantity: (id, quantity) => set((state) => ({
    cart: quantity <= 0
      ? state.cart.filter((item) => item.id !== id)
      : state.cart.map((item) => item.id === id ? { ...item, quantity } : item)
  })),

  clearCart: () => set({ cart: [] }),

  // =============================================
  // VENTAS
  // =============================================

  completeSale: async (paymentMethod, clientId, initialPayment) => {
    const { cart, settings, products } = get();
    toast.dismiss();

    if (cart.length === 0) {
      toast.error("El carrito está vacío 🛒");
      return;
    }

    const invalidItem = cart.find(item => {
      const product = products.find(p => p.id === item.id);
      return !product || Number(item.quantity) > Number(product.stock);
    });

    if (invalidItem) {
      const product = products.find(p => p.id === invalidItem.id);
      const currentStock = product ? Number(product.stock) : 0;
      toast.error(
        `⛔ STOCK INSUFICIENTE\n${invalidItem.name}\nSolicitas: ${invalidItem.quantity}\nDisponible: ${currentStock}`,
        { duration: 5000, style: { border: '2px solid red' } }
      );
      return;
    }

    const loadingToast = toast.loading('Procesando venta...');

    try {
      const totalUSD = Math.round(cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0) * 100) / 100;
      const totalVED = Math.round((totalUSD * settings.tasaBCV) * 100) / 100;

      const paidAmount = initialPayment !== undefined ? initialPayment : totalUSD;
      let status: SaleStatus = 'COMPLETED';
      if (paidAmount < totalUSD - 0.01) status = paidAmount > 0 ? 'PARTIAL' : 'PENDING';

      const { data: saleData, error: saleError } = await supabase.from('sales').insert({
        client_id: clientId || null,
        total_usd: totalUSD,
        total_ved: totalVED,
        payment_method: paymentMethod,
        status: status,
        paid_amount_usd: paidAmount,
        date: new Date().toISOString()
      }).select().single();

      if (saleError || !saleData) throw new Error(saleError?.message);

      const saleItems = cart.map(item => ({
        sale_id: saleData.id,
        product_id: item.id,
        quantity: item.quantity,
        unit_price_usd: item.priceFinalUSD,
        cost_unit_usd: item.cost,
        product_name_snapshot: item.name
      }));

      const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
      if (itemsError) throw new Error(itemsError.message);

      if (paidAmount > 0) {
        await supabase.from('payments').insert({
          sale_id: saleData.id,
          amount_usd: paidAmount,
          method: paymentMethod,
          note: 'Pago Inicial'
        });
      }

      for (const item of cart) {
        const product = products.find(p => p.id === item.id);
        if (product) {
          const newStock = Number(product.stock) - Number(item.quantity);
          await supabase.from('products').update({ stock: newStock }).eq('id', item.id);
        }
      }

      toast.dismiss(loadingToast);
      toast.success(`✅ Venta Registrada\nTicket #${saleData.id.slice(-6)}`);
      set({ cart: [] });
      get().fetchInitialData();

    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error(`Error crítico: ${error.message}`);
    }
  },

  annulSale: async (saleId) => {
    const loadingToast = toast.loading('Anulando venta y restaurando stock...');

    try {
      const { data: saleItems, error: fetchError } = await supabase
        .from('sale_items')
        .select('product_id, quantity')
        .eq('sale_id', saleId);

      if (fetchError) throw fetchError;

      const { error: updateError } = await supabase
        .from('sales')
        .update({ status: 'CANCELLED' })
        .eq('id', saleId);

      if (updateError) throw updateError;

      if (saleItems) {
        const { products } = get();
        for (const item of saleItems) {
          if (item.product_id) {
            const product = products.find(p => p.id === item.product_id);
            if (product) {
              const restoredStock = Number(product.stock) + Number(item.quantity);
              await supabase.from('products').update({ stock: restoredStock }).eq('id', item.product_id);
            }
          }
        }
      }

      toast.dismiss(loadingToast);
      toast.success("Venta anulada y stock devuelto 📦");
      get().fetchInitialData();

    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error("Error al anular: " + error.message);
    }
  },

  deleteSale: async (saleId) => {
    const loadingToast = toast.loading("Eliminando venta...");
    try {
      const { error } = await supabase.from('sales').delete().eq('id', saleId);
      if (error) throw error;

      set(state => ({ sales: state.sales.filter(s => s.id !== saleId) }));
      toast.dismiss(loadingToast);
      toast.success("Venta eliminada del historial 🗑️");
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error("Error al eliminar: " + error.message);
    }
  },

  registerSalePayment: async (saleId, payment) => {
    const sale = get().sales.find(s => s.id === saleId);
    if (!sale) return;

    const debt = sale.totalUSD - sale.paidAmountUSD;
    if (payment.amountUSD > debt + 0.01) {
      toast.error(`⚠️ El monto excede la deuda.\nDeuda actual: $${debt.toFixed(2)}`);
      return;
    }

    try {
      await supabase.from('payments').insert({
        sale_id: saleId,
        amount_usd: payment.amountUSD,
        method: payment.method,
        note: payment.note
      });

      const newPaid = sale.paidAmountUSD + payment.amountUSD;
      let newStatus = sale.status;
      if (newPaid >= sale.totalUSD - 0.01) newStatus = 'COMPLETED';
      else if (newPaid > 0) newStatus = 'PARTIAL';

      await supabase.from('sales').update({
        paid_amount_usd: newPaid,
        status: newStatus
      }).eq('id', saleId);

      toast.success("Abono registrado");
      get().fetchInitialData();
    } catch (error: any) {
      toast.error("Error: " + error.message);
    }
  },

  // =============================================
  // FACTURAS DE COMPRA
  // =============================================

  addInvoice: async (invoice) => {
    const loadingToast = toast.loading("Registrando factura...");
    try {
      const { error } = await supabase.from('invoices').insert({
        number: invoice.number,
        supplier: invoice.supplier,
        date_issue: invoice.dateIssue,
        date_due: invoice.dateDue,
        status: invoice.status,
        cost_type: invoice.costType,
        items: invoice.items,
        subtotal_usd: invoice.subtotalUSD,
        freight_total_usd: invoice.freightTotalUSD,
        total_usd: invoice.totalUSD,
        paid_amount_usd: invoice.paidAmountUSD,
        payments: invoice.payments || []
      });

      if (error) throw error;

      const totalItemsQuantity = invoice.items.reduce((acc, item) => acc + item.quantity, 0);
      const unitFreight = totalItemsQuantity > 0
        ? Math.round((invoice.freightTotalUSD / totalItemsQuantity) * 100) / 100
        : 0;

      for (const item of invoice.items) {
        const existing = get().products.find(p => p.sku === item.sku);
        if (existing) {
          await supabase.from('products').update({
            stock: Number(existing.stock) + Number(item.quantity),
            cost: item.costUnitUSD,
            cost_type: invoice.costType,
            freight: unitFreight
          }).eq('id', existing.id);
        } else {
          await supabase.from('products').insert({
            sku: item.sku,
            name: item.name,
            stock: Number(item.quantity),
            cost: item.costUnitUSD,
            min_stock: item.minStock,
            category: 'General',
            cost_type: invoice.costType,
            supplier: invoice.supplier,
            freight: unitFreight
          });
        }
      }

      const existingSupplier = get().suppliers.find(s => s.name.toLowerCase() === invoice.supplier.toLowerCase());
      const newCatalogItems = invoice.items.map(item => ({
        sku: item.sku, name: item.name, lastCost: item.costUnitUSD
      }));

      if (existingSupplier) {
        const mergedCatalog = [...(existingSupplier.catalog || [])];
        newCatalogItems.forEach(newItem => {
          const idx = mergedCatalog.findIndex(c => c.sku === newItem.sku);
          if (idx >= 0) mergedCatalog[idx] = newItem;
          else mergedCatalog.push(newItem);
        });
        await supabase.from('suppliers').update({ catalog: mergedCatalog }).eq('id', existingSupplier.id);
      } else {
        await supabase.from('suppliers').insert({ name: invoice.supplier, catalog: newCatalogItems });
      }

      toast.dismiss(loadingToast);
      toast.success("Factura y Stock actualizados 📦");
      get().fetchInitialData();
      return true;

    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error("Error al registrar: " + error.message);
      return false;
    }
  },

  updateInvoice: async (invoice) => {
    const loadingToast = toast.loading("Actualizando factura...");
    try {
      const { error } = await supabase.from('invoices').update({
        number: invoice.number,
        supplier: invoice.supplier,
        date_due: invoice.dateDue,
        status: invoice.status,
        items: invoice.items,
        subtotal_usd: invoice.subtotalUSD,
        freight_total_usd: invoice.freightTotalUSD,
        total_usd: invoice.totalUSD,
        paid_amount_usd: invoice.paidAmountUSD,
        payments: invoice.payments
      }).eq('id', invoice.id);

      if (error) throw error;

      set(state => ({ invoices: state.invoices.map(i => i.id === invoice.id ? invoice : i) }));
      toast.dismiss(loadingToast);
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error("Error al actualizar factura: " + error.message);
    }
  },

  deleteInvoice: async (id) => {
    const loadingToast = toast.loading("Eliminando factura...");
    try {
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) throw error;

      set(state => ({ invoices: state.invoices.filter(i => i.id !== id) }));
      toast.dismiss(loadingToast);
      toast.success("Factura eliminada 🗑️");
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error("Error al eliminar: " + error.message);
    }
  },

  registerPayment: async (invoiceId, payment) => {
    const loadingToast = toast.loading("Registrando pago...");
    try {
      const invoice = get().invoices.find(i => i.id === invoiceId);
      if (!invoice) throw new Error("Factura no encontrada");

      const newPaidAmount = invoice.paidAmountUSD + payment.amountUSD;
      const newPayments = [...(invoice.payments || []), payment];

      let newStatus = invoice.status;
      if (newPaidAmount >= invoice.totalUSD - 0.01) newStatus = 'PAID';
      else if (newPaidAmount > 0) newStatus = 'PARTIAL';

      const { error } = await supabase.from('invoices').update({
        paid_amount_usd: newPaidAmount,
        status: newStatus,
        payments: newPayments
      }).eq('id', invoiceId);

      if (error) throw error;

      set(state => ({
        invoices: state.invoices.map(i =>
          i.id === invoiceId
            ? { ...i, paidAmountUSD: newPaidAmount, status: newStatus, payments: newPayments }
            : i
        )
      }));

      toast.dismiss(loadingToast);
      toast.success("Abono registrado con éxito");
      get().fetchInitialData();
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error("Error al registrar pago: " + error.message);
    }
  },

  // =============================================
  // MÉTODOS DE PAGO — ✅ FIX 1.2: Ahora persisten en Supabase
  // =============================================

  addPaymentMethod: async (name, currency) => {
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .insert({ name, currency })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        set(state => ({
          paymentMethods: [...state.paymentMethods, { id: data.id, name: data.name, currency: data.currency }]
        }));
        toast.success("Método de pago agregado");
      }
    } catch (error: any) {
      toast.error("Error al agregar método: " + error.message);
    }
  },

  deletePaymentMethod: async (id) => {
    try {
      const { error } = await supabase
        .from('payment_methods')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        paymentMethods: state.paymentMethods.filter(pm => pm.id !== id)
      }));
      toast.success("Método de pago eliminado");
    } catch (error: any) {
      toast.error("Error al eliminar método: " + error.message);
    }
  },

  // =============================================
  // CIERRE DE CAJA
  // =============================================

  performDailyClose: async () => {
    const now = new Date().toISOString();
    try {
      const settingsId = get().settingsId; // ✅ BONUS: Usamos ID cacheado
      if (settingsId) {
        await supabase.from('settings').update({ last_close_date: now }).eq('id', settingsId);
      } else {
        await supabase.from('settings').update({ last_close_date: now }).neq('id', '00000000-0000-0000-0000-000000000000');
      }
      set(state => ({ settings: { ...state.settings, lastCloseDate: now } }));
      toast.success("Cierre de caja exitoso 🏁");
    } catch (error) {
      toast.error("Error al cerrar caja");
    }
  }

}));
