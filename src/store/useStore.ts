import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Product, CartItem, Sale, Invoice, Payment, AppSettings,
  Supplier, PaymentMethod, Client, SaleStatus, PaymentStatus
} from '../types';

interface StoreState {
  settings: AppSettings;
  products: Product[];
  cart: CartItem[];
  sales: Sale[];
  invoices: Invoice[];
  suppliers: Supplier[];
  clients: Client[];
  paymentMethods: PaymentMethod[];

  updateSettings: (settings: AppSettings) => void;

  addProduct: (product: Product) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  addClient: (client: Client) => void;
  updateClient: (id: string, updates: Partial<Client>) => void;
  deleteClient: (id: string) => void;

  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  completeSale: (paymentMethod: string, clientId?: string, initialPayment?: number) => void;

  annulSale: (saleId: string) => void;

  registerSalePayment: (saleId: string, payment: Payment) => void;

  addInvoice: (invoice: Invoice) => boolean;
  updateInvoice: (invoice: Invoice) => void;
  registerPayment: (invoiceId: string, payment: Payment) => void;

  addPaymentMethod: (name: string, currency: 'USD' | 'BS') => void;
  deletePaymentMethod: (id: string) => void;

  // NUEVO: Acción para cerrar caja
  performDailyClose: () => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      settings: {
        companyName: 'Todo en Ruedas C.A.',
        rif: '000000000',
        rifType: 'J',
        address: 'San Cristóbal, Táchira',
        tasaBCV: 64.50,
        tasaTH: 70.00,
        showMonitorRate: true,
        lastUpdated: new Date().toISOString(),
        lastCloseDate: new Date(0).toISOString(), // FECHA INICIAL (AÑO 1970)
        defaultMargin: 30,
        defaultVAT: 16,
        printerCurrency: 'BS'
      },
      products: [],
      cart: [],
      sales: [],
      invoices: [],
      suppliers: [],
      clients: [],
      paymentMethods: [
        { id: '1', name: 'Efectivo Divisa', currency: 'USD' },
        { id: '2', name: 'Pago Móvil', currency: 'BS' },
        { id: '3', name: 'Zelle', currency: 'USD' },
        { id: '4', name: 'Punto de Venta', currency: 'BS' },
        { id: '5', name: 'Crédito / Fiado', currency: 'USD' }
      ],

      updateSettings: (newSettings) => set({ settings: newSettings }),

      addProduct: (product) => set((state) => ({ products: [...state.products, product] })),
      updateProduct: (id, updates) => set((state) => ({
        products: state.products.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      })),
      deleteProduct: (id) => set((state) => ({
        products: state.products.filter((p) => p.id !== id),
      })),

      addClient: (client) => set((state) => ({ clients: [...state.clients, client] })),
      updateClient: (id, updates) => set((state) => ({
        clients: state.clients.map((c) => (c.id === id ? { ...c, ...updates } : c))
      })),
      deleteClient: (id) => set((state) => ({
        clients: state.clients.filter((c) => c.id !== id)
      })),

      addToCart: (product) => set((state) => {
        const existing = state.cart.find((item) => item.id === product.id);
        const costBase = product.cost + (product.freight || 0);
        const rate = product.costType === 'BCV' ? 1 : (state.settings.tasaTH / state.settings.tasaBCV);
        const costUSD = costBase * rate;
        const margin = product.customMargin ?? state.settings.defaultMargin;
        const vat = product.customVAT ?? state.settings.defaultVAT;
        const priceFinalUSD = costUSD * (1 + margin / 100) * (1 + vat / 100);

        if (existing) {
          return {
            cart: state.cart.map((item) =>
              item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
            ),
          };
        }
        return { cart: [...state.cart, { ...product, quantity: 1, priceFinalUSD }] };
      }),

      removeFromCart: (id) => set((state) => ({
        cart: state.cart.filter((item) => item.id !== id),
      })),
      updateCartQuantity: (id, quantity) => set((state) => ({
        cart: quantity <= 0
          ? state.cart.filter((item) => item.id !== id)
          : state.cart.map((item) => item.id === id ? { ...item, quantity } : item),
      })),
      clearCart: () => set({ cart: [] }),

      // --- VENTAS ---
      completeSale: (paymentMethod, clientId, initialPayment) => {
        const { cart, settings, products } = get();
        const totalUSD = cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0);
        const totalVED = totalUSD * settings.tasaBCV;

        const paidAmount = initialPayment !== undefined ? initialPayment : totalUSD;

        let status: SaleStatus = 'COMPLETED';
        if (paidAmount < totalUSD - 0.01) {
          status = paidAmount > 0 ? 'PARTIAL' : 'PENDING';
        }

        const newSale: Sale = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          totalUSD,
          totalVED,
          paymentMethod,
          status,
          clientId,
          paidAmountUSD: paidAmount,
          payments: paidAmount > 0 ? [{
            id: Date.now().toString(),
            date: new Date().toISOString(),
            amountUSD: paidAmount,
            method: paymentMethod,
            note: 'Pago Inicial / Contado'
          }] : [],
          items: cart.map(item => ({
            sku: item.sku,
            name: item.name,
            quantity: item.quantity,
            priceFinalUSD: item.priceFinalUSD,
            costUnitUSD: item.cost
          }))
        };

        const updatedProducts = products.map(p => {
          const inCart = cart.find(c => c.id === p.id);
          if (inCart) return { ...p, stock: p.stock - inCart.quantity };
          return p;
        });

        set((state) => ({
          sales: [newSale, ...state.sales],
          products: updatedProducts,
          cart: []
        }));
      },

      annulSale: (saleId) => {
        const { sales, products } = get();
        const saleToAnnul = sales.find(s => s.id === saleId);
        if (!saleToAnnul) return;

        const updatedProducts = [...products];
        saleToAnnul.items.forEach(item => {
          const productIndex = updatedProducts.findIndex(p => p.sku === item.sku);
          if (productIndex >= 0) {
            updatedProducts[productIndex] = {
              ...updatedProducts[productIndex],
              stock: updatedProducts[productIndex].stock + item.quantity
            };
          }
        });

        set((state) => ({
          products: updatedProducts,
          sales: state.sales.map(s => s.id === saleId ? { ...s, status: 'CANCELLED' } : s)
        }));
      },

      registerSalePayment: (saleId, payment) => set(state => {
        const sale = state.sales.find(s => s.id === saleId);
        if (!sale) return {};

        const newPaidAmount = sale.paidAmountUSD + payment.amountUSD;
        let newStatus: SaleStatus = sale.status;

        if (newPaidAmount >= sale.totalUSD - 0.01) newStatus = 'COMPLETED';
        else if (newPaidAmount > 0) newStatus = 'PARTIAL';

        const updatedSale = {
          ...sale,
          paidAmountUSD: newPaidAmount,
          status: newStatus,
          payments: [...sale.payments, payment]
        };

        return {
          sales: state.sales.map(s => s.id === saleId ? updatedSale : s)
        };
      }),

      // --- COMPRAS ---
      addInvoice: (invoice) => {
        set((state) => {
          const updatedProducts = [...state.products];
          const updatedSuppliers = [...state.suppliers];
          let supplierIndex = updatedSuppliers.findIndex(s => s.name.toLowerCase() === invoice.supplier.toLowerCase());

          if (supplierIndex === -1) {
            updatedSuppliers.push({ id: Date.now().toString(), name: invoice.supplier, catalog: [] });
            supplierIndex = updatedSuppliers.length - 1;
          }

          invoice.items.forEach(item => {
            const existingProdIndex = updatedProducts.findIndex(p => p.sku === item.sku);
            if (existingProdIndex >= 0) {
              const prod = updatedProducts[existingProdIndex];
              updatedProducts[existingProdIndex] = {
                ...prod,
                stock: prod.stock + item.quantity,
                cost: item.costUnitUSD,
                costType: invoice.costType,
                supplier: invoice.supplier
              };
            } else {
              updatedProducts.push({
                id: Date.now().toString() + Math.random(),
                sku: item.sku,
                name: item.name,
                category: 'General',
                stock: item.quantity,
                minStock: item.minStock,
                cost: item.costUnitUSD,
                costType: invoice.costType,
                supplier: invoice.supplier,
                freight: 0
              });
            }
            const catalog = updatedSuppliers[supplierIndex].catalog;
            const catalogItemIndex = catalog.findIndex(c => c.sku === item.sku);
            if (catalogItemIndex >= 0) {
              catalog[catalogItemIndex].lastCost = item.costUnitUSD;
            } else {
              catalog.push({ sku: item.sku, name: item.name, lastCost: item.costUnitUSD });
            }
          });

          return {
            invoices: [...state.invoices, invoice],
            products: updatedProducts,
            suppliers: updatedSuppliers
          };
        });
        return true;
      },

      updateInvoice: (invoice) => set(state => ({
        invoices: state.invoices.map(inv => inv.id === invoice.id ? invoice : inv)
      })),

      registerPayment: (invoiceId, payment) => set(state => {
        const invoice = state.invoices.find(i => i.id === invoiceId);
        if (!invoice) return {};

        const newPaidAmount = invoice.paidAmountUSD + payment.amountUSD;
        let newStatus: PaymentStatus = invoice.status;

        if (newPaidAmount >= invoice.totalUSD - 0.01) newStatus = 'PAID';
        else if (newPaidAmount > 0) newStatus = 'PARTIAL';

        const updatedInvoice = {
          ...invoice,
          paidAmountUSD: newPaidAmount,
          status: newStatus,
          payments: [...invoice.payments, payment]
        };

        return {
          invoices: state.invoices.map(i => i.id === invoiceId ? updatedInvoice : i)
        };
      }),

      addPaymentMethod: (name, currency) => set(state => ({
        paymentMethods: [...state.paymentMethods, { id: Date.now().toString(), name, currency }]
      })),

      deletePaymentMethod: (id) => set(state => ({
        paymentMethods: state.paymentMethods.filter(pm => pm.id !== id)
      })),

      // NUEVO: Función que ejecuta el corte Z
      performDailyClose: () => set(state => ({
        settings: {
          ...state.settings,
          lastCloseDate: new Date().toISOString()
        }
      }))
    }),
    {
      name: 'todo-en-ruedas-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);