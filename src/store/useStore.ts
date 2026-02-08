/**
 * @file useStore.ts
 * @description Gestor de Estado Global usando Zustand.
 * Maneja toda la lógica de negocio: Inventario, Ventas, Caja y Configuración.
 * Implementa persistencia automática en LocalStorage.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  GlobalSettings, Product, CartItem, Sale, Invoice, Payment,
  Supplier, DailyClose, PaymentMethod, PaymentCurrency, PaymentStatus
} from '../types';
import { calculatePrices } from '../utils/pricing';

// --- INTERFAZ DEL ESTADO ---
interface AppState {
  // Datos
  settings: GlobalSettings;
  products: Product[];
  cart: CartItem[];
  sales: Sale[];
  invoices: Invoice[];
  suppliers: Supplier[];
  dailyCloses: DailyClose[];
  paymentMethods: PaymentMethod[];

  // Acciones: Configuración
  updateSettings: (newSettings: Partial<GlobalSettings>) => void;
  addPaymentMethod: (name: string, currency: PaymentCurrency) => void;
  deletePaymentMethod: (id: string) => void;

  // Acciones: Productos
  addProduct: (product: Product) => void;
  updateProduct: (id: string, updatedData: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  // Acciones: Facturación (Compras)
  addInvoice: (invoice: Invoice) => boolean;
  updateInvoice: (updatedInvoice: Invoice) => void;
  registerPayment: (invoiceId: string, payment: Payment) => void;

  // Acciones: Ventas (POS)
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  completeSale: (paymentMethod: string) => void;

  // Acciones: Gestión de Ventas
  updateSale: (updatedSale: Sale) => boolean; // Retorna true si tuvo éxito
  annulSale: (saleId: string) => void;

  // Acciones: Caja
  registerDailyClose: (notes?: string) => void;
}

// --- DATOS INICIALES (Mocks) ---
// ... (Aquí puedes mantener tus datos iniciales 'initialProducts', etc. o dejarlos vacíos para prod)
// Para el ejemplo limpio, usaré arreglos vacíos, pero tú mantén los tuyos si quieres data de prueba.
const initialSettings: GlobalSettings = {
  tasaBCV: 312, tasaTH: 750, defaultMargin: 30, defaultVAT: 16,
  lastUpdated: new Date().toISOString(), showMonitorRate: true,
  companyName: 'TODO EN RUEDAS C.A.', rifType: 'J', rif: '00000000-0',
  address: 'DIRECCIÓN FISCAL', printerCurrency: 'BS'
};

/**
 * Helper para calcular el estado de pago de una factura
 */
const calculatePaymentStatus = (total: number, paid: number): PaymentStatus => {
  // Margen de error de 0.01 para flotantes
  if (paid >= total - 0.01) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'PENDING';
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      settings: initialSettings,
      products: [],
      invoices: [],
      suppliers: [],
      cart: [],
      sales: [],
      dailyCloses: [],
      paymentMethods: [{ id: '1', name: 'Efectivo', currency: 'USD' }],

      // --- CONFIGURACIÓN ---
      updateSettings: (newSettings) =>
        set((state) => ({ settings: { ...state.settings, ...newSettings } })),

      addPaymentMethod: (name, currency) =>
        set((state) => ({
          paymentMethods: [...state.paymentMethods, { id: Date.now().toString(), name, currency }]
        })),

      deletePaymentMethod: (id) =>
        set((state) => ({
          paymentMethods: state.paymentMethods.filter(pm => pm.id !== id)
        })),

      // --- PRODUCTOS ---
      addProduct: (product) =>
        set((state) => ({ products: [...state.products, product] })),

      updateProduct: (id, updatedData) =>
        set((state) => ({
          products: state.products.map((p) => p.id === id ? { ...p, ...updatedData } : p)
        })),

      deleteProduct: (id) => {
        const { sales, invoices } = get();
        // Validación de integridad referencial
        const hasSales = sales.some(s => s.items.some(i => i.id === id));
        // Nota: invoices usa SKU, no ID directo, pero es bueno revisar
        if (hasSales) {
          alert("⛔ NO SE PUEDE ELIMINAR\nEl producto tiene historial de ventas.");
          return;
        }
        set((state) => ({ products: state.products.filter((p) => p.id !== id) }));
      },

      // --- FACTURAS DE COMPRA ---
      addInvoice: (invoice) => {
        const { products, suppliers, invoices } = get();

        // Evitar duplicados
        if (invoices.some(inv => inv.number === invoice.number && inv.supplier === invoice.supplier)) {
          alert("⛔ Factura Duplicada.");
          return false;
        }

        // 1. Gestionar Proveedor (Crear o Actualizar Catálogo)
        let updatedSuppliers = [...suppliers];
        const existingSupplierIndex = suppliers.findIndex(s => s.name === invoice.supplier);

        if (existingSupplierIndex >= 0) {
          const supplier = updatedSuppliers[existingSupplierIndex];
          invoice.items.forEach(item => {
            // Si el producto no está en el catálogo, agregarlo
            if (!supplier.catalog.find(c => c.sku === item.sku)) {
              supplier.catalog.push({ sku: item.sku, name: item.name, lastCost: item.costUnitUSD });
            }
          });
        } else {
          updatedSuppliers.push({
            id: Date.now().toString(),
            name: invoice.supplier,
            catalog: invoice.items.map(i => ({ sku: i.sku, name: i.name, lastCost: i.costUnitUSD }))
          });
        }

        // 2. Actualizar Inventario (Stock y Costos)
        const updatedProducts = [...products];
        // Calcular flete unitario promedio para prorratear
        const totalQty = invoice.items.reduce((acc, item) => acc + item.quantity, 0);
        const freightPerUnit = totalQty > 0 ? invoice.freightTotalUSD / totalQty : 0;

        invoice.items.forEach(incomingItem => {
          const existingIndex = updatedProducts.findIndex(p => p.sku === incomingItem.sku);

          if (existingIndex >= 0) {
            // Actualizar existente
            const prod = updatedProducts[existingIndex];
            updatedProducts[existingIndex] = {
              ...prod,
              stock: prod.stock + incomingItem.quantity,
              cost: incomingItem.costUnitUSD,
              freight: freightPerUnit,
              // Opcional: Actualizar el proveedor actual al último que vendió
              supplier: invoice.supplier
            };
          } else {
            // Crear nuevo
            updatedProducts.push({
              id: Date.now().toString() + Math.random(), // ID único simple
              sku: incomingItem.sku,
              name: incomingItem.name,
              category: 'General',
              stock: incomingItem.quantity,
              minStock: incomingItem.minStock || 5,
              cost: incomingItem.costUnitUSD,
              freight: freightPerUnit,
              costType: invoice.costType,
              supplier: invoice.supplier
            });
          }
        });

        // 3. Crear Factura con estado inicial
        const newInvoice = {
          ...invoice,
          paidAmountUSD: invoice.status === 'PAID' ? invoice.totalUSD : (invoice.paidAmountUSD || 0),
          payments: invoice.paidAmountUSD > 0 ? [{
            id: Date.now().toString(),
            date: invoice.dateIssue,
            amountUSD: invoice.paidAmountUSD,
            method: 'Inicial',
            note: 'Abono carga inicial'
          }] : []
        };

        set((state) => ({
          products: updatedProducts,
          invoices: [...state.invoices, newInvoice],
          suppliers: updatedSuppliers
        }));
        return true;
      },

      updateInvoice: (updatedInvoice) => {
        const { invoices } = get();
        // Recalcular totales por seguridad
        const subtotal = updatedInvoice.items.reduce((acc, item) => acc + (item.quantity * item.costUnitUSD), 0);
        const total = subtotal + updatedInvoice.freightTotalUSD;
        const status = calculatePaymentStatus(total, updatedInvoice.paidAmountUSD);

        set({
          invoices: invoices.map(inv =>
            inv.id === updatedInvoice.id
              ? { ...updatedInvoice, subtotalUSD: subtotal, totalUSD: total, status }
              : inv
          )
        });
      },

      registerPayment: (invoiceId, payment) => {
        const { invoices } = get();
        set({
          invoices: invoices.map(inv => {
            if (inv.id !== invoiceId) return inv;

            const newPaidAmount = inv.paidAmountUSD + payment.amountUSD;
            const newStatus = calculatePaymentStatus(inv.totalUSD, newPaidAmount);

            return {
              ...inv,
              paidAmountUSD: newPaidAmount,
              status: newStatus,
              payments: [...inv.payments, payment]
            };
          })
        });
      },

      // --- CARRITO & POS ---
      addToCart: (product) => {
        const { settings, cart } = get();
        const existingItem = cart.find((item) => item.id === product.id);
        const currentQtyInCart = existingItem ? existingItem.quantity : 0;

        // Validaciones de Stock
        if (product.stock === 0) { alert("¡Producto agotado!"); return; }
        if (currentQtyInCart + 1 > product.stock) { alert(`Stock insuficiente (Max: ${product.stock})`); return; }

        if (existingItem) {
          set({ cart: cart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) });
        } else {
          const prices = calculatePrices(product, settings);
          set({
            cart: [...cart, {
              ...product,
              quantity: 1,
              priceBaseUSD: prices.basePriceUSD,
              priceTaxUSD: prices.taxAmountUSD,
              priceFinalUSD: prices.finalPriceUSD
            }]
          });
        }
      },

      removeFromCart: (productId) =>
        set((state) => ({ cart: state.cart.filter((p) => p.id !== productId) })),

      updateCartQuantity: (productId, quantity) => {
        const { products } = get();
        const product = products.find(p => p.id === productId);
        if (!product) return;

        if (quantity > product.stock) { alert(`Stock insuficiente.`); return; }

        set((state) => ({
          cart: state.cart.map((p) => p.id === productId ? { ...p, quantity: Math.max(1, quantity) } : p)
        }));
      },

      clearCart: () => set({ cart: [] }),

      completeSale: (paymentMethod) => {
        const { cart, products, sales, settings } = get();
        if (cart.length === 0) return;

        const totalUSD = cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0);

        const newSale: Sale = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          totalUSD,
          totalVED: totalUSD * settings.tasaBCV,
          items: [...cart],
          status: 'COMPLETED',
          paymentMethod
        };

        // Descontar inventario
        const updatedProducts = products.map(product => {
          const cartItem = cart.find(item => item.id === product.id);
          if (cartItem) {
            return { ...product, stock: product.stock - cartItem.quantity };
          }
          return product;
        });

        set({ products: updatedProducts, sales: [...sales, newSale], cart: [] });
      },

      updateSale: (updatedSale) => {
        const { sales, products, settings } = get();
        const oldSale = sales.find(s => s.id === updatedSale.id);

        if (!oldSale) return false;

        // Lógica compleja: Revertir stock viejo y aplicar stock nuevo
        // 1. Copia temporal de productos
        let tempProducts = products.map(p => ({ ...p }));

        // 2. Devolver stock de la venta anterior
        oldSale.items.forEach(oldItem => {
          const pIndex = tempProducts.findIndex(p => p.id === oldItem.id);
          if (pIndex >= 0) tempProducts[pIndex].stock += oldItem.quantity;
        });

        // 3. Descontar nuevo stock y validar
        for (const newItem of updatedSale.items) {
          const pIndex = tempProducts.findIndex(p => p.id === newItem.id);
          if (pIndex === -1) continue; // Si el producto ya no existe, ignorar (edge case)

          if (newItem.quantity > tempProducts[pIndex].stock) {
            alert(`ERROR: Stock insuficiente para ${tempProducts[pIndex].name} (Disp: ${tempProducts[pIndex].stock})`);
            return false;
          }
          tempProducts[pIndex].stock -= newItem.quantity;
        }

        // 4. Recalcular total venta
        const totalUSD = updatedSale.items.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0);

        set({
          products: tempProducts,
          sales: sales.map(s => s.id === updatedSale.id ? {
            ...updatedSale,
            totalUSD,
            totalVED: totalUSD * settings.tasaBCV
          } : s)
        });
        return true;
      },

      annulSale: (saleId) => {
        const { sales, products } = get();
        const saleToAnnul = sales.find(s => s.id === saleId);

        if (!saleToAnnul || saleToAnnul.status === 'CANCELLED') return;
        if (!window.confirm("¿ANULAR venta? El stock será devuelto al inventario.")) return;

        // Devolver stock
        let updatedProducts = [...products];
        saleToAnnul.items.forEach(item => {
          const pIndex = updatedProducts.findIndex(p => p.id === item.id);
          if (pIndex >= 0) updatedProducts[pIndex].stock += item.quantity;
        });

        set({
          products: updatedProducts,
          sales: sales.map(s => s.id === saleId ? { ...s, status: 'CANCELLED' } : s)
        });
        alert("✅ Venta anulada exitosamente.");
      },

      // --- CIERRE DE CAJA ---
      registerDailyClose: (notes) => {
        const { sales, dailyCloses } = get();
        const todayStr = new Date().toLocaleDateString('es-ES');

        // Evitar múltiples cierres el mismo día (opcional, pero recomendado)
        if (dailyCloses.some(c => new Date(c.date).toLocaleDateString('es-ES') === todayStr)) {
          alert("⚠️ Ya has realizado el cierre de caja hoy.");
          return;
        }

        const todaysSales = sales.filter(s =>
          new Date(s.date).toLocaleDateString('es-ES') === todayStr &&
          s.status !== 'CANCELLED'
        );

        if (todaysSales.length === 0) {
          if (!window.confirm("No hay ventas hoy. ¿Cerrar en $0?")) return;
        }

        const totalUSD = todaysSales.reduce((acc, s) => acc + s.totalUSD, 0);

        // Agrupar por método de pago
        const totalByMethod: Record<string, number> = {};
        todaysSales.forEach(s => {
          const method = s.paymentMethod || 'Efectivo';
          totalByMethod[method] = (totalByMethod[method] || 0) + s.totalUSD;
        });

        const newClose: DailyClose = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          totalUSD,
          totalByMethod,
          totalTickets: todaysSales.length,
          notes
        };

        set({ dailyCloses: [newClose, ...dailyCloses] });
        alert("✅ Cierre de Caja guardado con éxito.");
      }
    }),
    {
      name: 'todo-en-ruedas-storage', // Nombre clave en LocalStorage
      storage: createJSONStorage(() => localStorage),
    }
  )
);