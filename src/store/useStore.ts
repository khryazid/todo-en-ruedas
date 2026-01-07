import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { GlobalSettings, Product, CartItem, Sale, Invoice, Payment, Supplier, DailyClose, PaymentMethod, PaymentCurrency } from '../types';
import { calculatePrices } from '../utils/pricing';

interface AppState {
  settings: GlobalSettings;
  products: Product[];
  cart: CartItem[];
  sales: Sale[];
  invoices: Invoice[];
  suppliers: Supplier[];
  dailyCloses: DailyClose[];
  paymentMethods: PaymentMethod[];

  updateSettings: (newSettings: Partial<GlobalSettings>) => void;
  addPaymentMethod: (name: string, currency: PaymentCurrency) => void;
  deletePaymentMethod: (id: string) => void;
  addProduct: (product: Product) => void;
  updateProduct: (id: string, updatedData: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  addInvoice: (invoice: Invoice) => boolean;
  updateInvoice: (updatedInvoice: Invoice) => void;
  registerPayment: (invoiceId: string, payment: Payment) => void;
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  completeSale: (paymentMethod: string) => void;
  updateSale: (updatedSale: Sale) => boolean;
  annulSale: (saleId: string) => void;
  registerDailyClose: (notes?: string) => void;
}

// --- TUS DATOS INICIALES ---

const initialSuppliers: Supplier[] = [
  {
    id: 'sup-1',
    name: 'Inversiones La Fuente, C.A.',
    catalog: [
      // Factura 86
      { sku: '05-023-127', name: 'Rueda Goma Elastica 3" Gira C/Freno EXX', lastCost: 4.78 },
      { sku: '05-023-171', name: 'Rueda PU + Hierro 3" Giratoria EXXEL', lastCost: 5.97 },
      { sku: '05-023-187', name: 'Rueda PP Roja 4" Giratoria EXXEL', lastCost: 3.99 },
      { sku: '05-023-189', name: 'Rueda PP Roja 3" Fija EXXEL', lastCost: 2.51 },
      { sku: '05-023-211', name: 'Rueda Hierro 3" Giratoria EXXEL', lastCost: 4.31 },
      { sku: '05-023-213', name: 'Rueda Hierro 3" Fija EXXEL', lastCost: 6.36 },
      { sku: '05-023-246', name: 'Rueda PVC Giratoria 1.5" C/Espiga 3/8"', lastCost: 1.19 },
      { sku: '05-023-247', name: 'Rueda PVC Giratoria 2" C/Espiga 3/8"', lastCost: 1.37 },
      { sku: '05-023-248', name: 'Rueda PVC Fija 1.5" C/Espiga 3/8" EXXE', lastCost: 1.03 },
      { sku: '05-023-250', name: 'Rueda PVC Giratoria C/Freno 1.5" C/Espi', lastCost: 1.43 },
      { sku: '05-023-251', name: 'Rueda PVC Giratoria C/Freno 2" C/Espig', lastCost: 1.88 },
      // Factura 85
      { sku: '05-023-069', name: 'Rueda Neumatica 14" Eje 3/4" P/Carret', lastCost: 16.38 },
      { sku: '05-023-070', name: 'Rueda P/Porton 50MM*15MM EXXEL', lastCost: 2.99 },
      { sku: '05-023-071', name: 'Rueda P/Porton 70MM*18MM EXXEL', lastCost: 5.14 },
      { sku: 'PN230321', name: 'Rueda Giratoria 5" EXXEL', lastCost: 2.18 },
      { sku: 'PN230324', name: 'Rueda Fija 2.5" EXXEL', lastCost: 2.34 },
      { sku: 'PN230478', name: 'Roldana Tipo U c/Base 40mm EXXEL', lastCost: 6.59 },
      { sku: '7826075X', name: 'Rueda PVC 3" Fija EXXEL', lastCost: 4.18 },
      { sku: '8126075X', name: 'Rueda PVC 3" Giratoria EXXEL', lastCost: 4.06 },
      { sku: '1918075F', name: 'Rueda Goma Negra 3" Fija EXXEL', lastCost: 3.88 },
      { sku: '3318075B', name: 'Rueda Goma Elastica 3" Giratoria EXXEL', lastCost: 3.99 },
    ]
  }
];

const initialProducts: Product[] = [
  // --- FACTURA 90329086 ---
  { id: '1', sku: '05-023-127', name: 'Rueda Goma Elastica 3" Gira C/Freno EXX', category: 'Ruedas', stock: 4, minStock: 2, cost: 4.78, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '2', sku: '05-023-171', name: 'Rueda PU + Hierro 3" Giratoria EXXEL', category: 'Ruedas', stock: 4, minStock: 2, cost: 5.97, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '3', sku: '05-023-187', name: 'Rueda PP Roja 4" Giratoria EXXEL', category: 'Ruedas', stock: 4, minStock: 2, cost: 3.99, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '4', sku: '05-023-189', name: 'Rueda PP Roja 3" Fija EXXEL', category: 'Ruedas', stock: 4, minStock: 2, cost: 2.51, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '5', sku: '05-023-211', name: 'Rueda Hierro 3" Giratoria EXXEL', category: 'Ruedas', stock: 4, minStock: 2, cost: 4.31, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '6', sku: '05-023-213', name: 'Rueda Hierro 3" Fija EXXEL', category: 'Ruedas', stock: 2, minStock: 1, cost: 6.36, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '7', sku: '05-023-246', name: 'Rueda PVC Giratoria 1.5" C/Espiga 3/8"', category: 'Ruedas', stock: 6, minStock: 3, cost: 1.19, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '8', sku: '05-023-247', name: 'Rueda PVC Giratoria 2" C/Espiga 3/8"', category: 'Ruedas', stock: 6, minStock: 3, cost: 1.37, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '9', sku: '05-023-248', name: 'Rueda PVC Fija 1.5" C/Espiga 3/8" EXXE', category: 'Ruedas', stock: 6, minStock: 3, cost: 1.03, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '10', sku: '05-023-250', name: 'Rueda PVC Giratoria C/Freno 1.5" C/Espi', category: 'Ruedas', stock: 6, minStock: 3, cost: 1.43, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '11', sku: '05-023-251', name: 'Rueda PVC Giratoria C/Freno 2" C/Espig', category: 'Ruedas', stock: 4, minStock: 2, cost: 1.88, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },

  // --- FACTURA 90329085 ---
  { id: '12', sku: '05-023-069', name: 'Rueda Neumatica 14" Eje 3/4" P/Carret', category: 'Ruedas', stock: 1, minStock: 1, cost: 16.38, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '13', sku: '05-023-070', name: 'Rueda P/Porton 50MM*15MM EXXEL', category: 'Ruedas', stock: 4, minStock: 2, cost: 2.99, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '14', sku: '05-023-071', name: 'Rueda P/Porton 70MM*18MM EXXEL', category: 'Ruedas', stock: 4, minStock: 2, cost: 5.14, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '15', sku: 'PN230321', name: 'Rueda Giratoria 5" EXXEL', category: 'Ruedas', stock: 2, minStock: 1, cost: 2.18, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '16', sku: 'PN230324', name: 'Rueda Fija 2.5" EXXEL', category: 'Ruedas', stock: 4, minStock: 1, cost: 2.34, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '17', sku: 'PN230478', name: 'Roldana Tipo U c/Base 40mm EXXEL', category: 'Ruedas', stock: 4, minStock: 2, cost: 6.59, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '18', sku: '7826075X', name: 'Rueda PVC 3" Fija EXXEL', category: 'Ruedas', stock: 4, minStock: 2, cost: 4.18, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '19', sku: '8126075X', name: 'Rueda PVC 3" Giratoria EXXEL', category: 'Ruedas', stock: 4, minStock: 2, cost: 4.06, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '20', sku: '1918075F', name: 'Rueda Goma Negra 3" Fija EXXEL', category: 'Ruedas', stock: 4, minStock: 2, cost: 3.88, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '21', sku: '3318075B', name: 'Rueda Goma Elastica 3" Giratoria EXXEL', category: 'Ruedas', stock: 4, minStock: 2, cost: 3.99, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
];

const initialInvoices: Invoice[] = [
  {
    id: 'inv-90329086',
    number: '90329086',
    supplier: 'Inversiones La Fuente, C.A.',
    dateIssue: '2025-11-24',
    dateDue: '2026-01-26',
    status: 'PENDING',
    costType: 'BCV',
    subtotalUSD: 136.60,
    freightTotalUSD: 0,
    totalUSD: 158.46,
    paidAmountUSD: 0,
    payments: [],
    items: [
      { id: '1', sku: '05-023-127', name: 'Rueda Goma Elastica 3" Gira C/Freno EXX', quantity: 4, costUnitUSD: 4.78 },
      { id: '2', sku: '05-023-171', name: 'Rueda PU + Hierro 3" Giratoria EXXEL', quantity: 4, costUnitUSD: 5.97 },
      { id: '3', sku: '05-023-187', name: 'Rueda PP Roja 4" Giratoria EXXEL', quantity: 4, costUnitUSD: 3.99 },
      { id: '4', sku: '05-023-189', name: 'Rueda PP Roja 3" Fija EXXEL', quantity: 4, costUnitUSD: 2.51 },
      { id: '5', sku: '05-023-211', name: 'Rueda Hierro 3" Giratoria EXXEL', quantity: 4, costUnitUSD: 4.31 },
      { id: '6', sku: '05-023-213', name: 'Rueda Hierro 3" Fija EXXEL', quantity: 2, costUnitUSD: 6.36 },
      { id: '7', sku: '05-023-246', name: 'Rueda PVC Giratoria 1.5" C/Espiga 3/8"', quantity: 6, costUnitUSD: 1.19 },
      { id: '8', sku: '05-023-247', name: 'Rueda PVC Giratoria 2" C/Espiga 3/8"', quantity: 6, costUnitUSD: 1.37 },
      { id: '9', sku: '05-023-248', name: 'Rueda PVC Fija 1.5" C/Espiga 3/8" EXXE', quantity: 6, costUnitUSD: 1.03 },
      { id: '10', sku: '05-023-250', name: 'Rueda PVC Giratoria C/Freno 1.5" C/Espi', quantity: 6, costUnitUSD: 1.43 },
      { id: '11', sku: '05-023-251', name: 'Rueda PVC Giratoria C/Freno 2" C/Espig', quantity: 4, costUnitUSD: 1.88 },
    ]
  },
  {
    id: 'inv-90329085',
    number: '90329085',
    supplier: 'Inversiones La Fuente, C.A.',
    dateIssue: '2025-11-24',
    dateDue: '2026-01-26',
    status: 'PENDING',
    costType: 'BCV',
    subtotalUSD: 135.28,
    freightTotalUSD: 0,
    totalUSD: 156.92,
    paidAmountUSD: 0,
    payments: [],
    items: [
      { id: '12', sku: '05-023-069', name: 'Rueda Neumatica 14" Eje 3/4" P/Carret', quantity: 1, costUnitUSD: 16.38 },
      { id: '13', sku: '05-023-070', name: 'Rueda P/Porton 50MM*15MM EXXEL', quantity: 4, costUnitUSD: 2.99 },
      { id: '14', sku: '05-023-071', name: 'Rueda P/Porton 70MM*18MM EXXEL', quantity: 4, costUnitUSD: 5.14 },
      { id: '15', sku: 'PN230321', name: 'Rueda Giratoria 5" EXXEL', quantity: 2, costUnitUSD: 2.18 },
      { id: '16', sku: 'PN230324', name: 'Rueda Fija 2.5" EXXEL', quantity: 4, costUnitUSD: 2.34 },
      { id: '17', sku: 'PN230478', name: 'Roldana Tipo U c/Base 40mm EXXEL', quantity: 4, costUnitUSD: 6.59 },
      { id: '18', sku: '7826075X', name: 'Rueda PVC 3" Fija EXXEL', quantity: 4, costUnitUSD: 4.18 },
      { id: '19', sku: '8126075X', name: 'Rueda PVC 3" Giratoria EXXEL', quantity: 4, costUnitUSD: 4.06 },
      { id: '20', sku: '1918075F', name: 'Rueda Goma Negra 3" Fija EXXEL', quantity: 4, costUnitUSD: 3.88 },
      { id: '21', sku: '3318075B', name: 'Rueda Goma Elastica 3" Giratoria EXXEL', quantity: 4, costUnitUSD: 3.99 },
    ]
  }
];

const initialPaymentMethods: PaymentMethod[] = [
  { id: 'pm-1', name: 'Efectivo Divisa', currency: 'USD' },
  { id: 'pm-2', name: 'Pago Móvil', currency: 'BS' },
  { id: 'pm-3', name: 'Zelle', currency: 'USD' },
  { id: 'pm-4', name: 'Punto de Venta', currency: 'BS' },
  { id: 'pm-5', name: 'Efectivo Bs', currency: 'BS' },
];

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      settings: {
        tasaBCV: 301.14, tasaTH: 600.00, defaultMargin: 30, defaultVAT: 16, lastUpdated: new Date().toISOString(), showMonitorRate: true,
        companyName: 'TODO EN RUEDAS C.A.', rifType: 'J', rif: '12345678-9', address: 'AV. PRINCIPAL, ANACO', printerCurrency: 'BS'
      },
      // --- ASIGNACIÓN DE DATOS INICIALES ---
      products: initialProducts, // <--- Aquí es donde se conectan
      invoices: initialInvoices, // <--- Aquí es donde se conectan
      suppliers: initialSuppliers, // <--- Aquí es donde se conectan

      cart: [],
      sales: [],
      dailyCloses: [],
      paymentMethods: initialPaymentMethods,

      updateSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),
      addPaymentMethod: (name, currency) => set((state) => ({ paymentMethods: [...state.paymentMethods, { id: Date.now().toString(), name, currency }] })),
      deletePaymentMethod: (id) => set((state) => ({ paymentMethods: state.paymentMethods.filter(pm => pm.id !== id) })),

      addProduct: (product) => set((state) => ({ products: [...state.products, product] })),
      updateProduct: (id, updatedData) => set((state) => ({ products: state.products.map((p) => p.id === id ? { ...p, ...updatedData } : p) })),
      deleteProduct: (id) => {
        const { sales, invoices, products } = get();
        const hasSales = sales.some(s => s.items.some(i => i.id === id));
        const hasInvoices = invoices.some(inv => inv.items.some(i => i.id === id || i.sku === products.find(p => p.id === id)?.sku));
        if (hasSales || hasInvoices) { alert("⛔ NO SE PUEDE ELIMINAR\nTiene historial."); return; }
        if (window.confirm("¿Eliminar producto?")) set((state) => ({ products: state.products.filter((p) => p.id !== id) }));
      },

      addInvoice: (invoice) => {
        const { products, suppliers, invoices } = get();
        if (invoices.some(inv => inv.number === invoice.number && inv.supplier === invoice.supplier)) { alert("⛔ Factura Duplicada."); return false; }

        let updatedSuppliers = [...suppliers];
        const existingSupplierIndex = suppliers.findIndex(s => s.name === invoice.supplier);
        if (existingSupplierIndex >= 0) {
          const supplier = updatedSuppliers[existingSupplierIndex];
          invoice.items.forEach(item => { if (!supplier.catalog.find(c => c.sku === item.sku)) supplier.catalog.push({ sku: item.sku, name: item.name, lastCost: item.costUnitUSD }); });
        } else { updatedSuppliers.push({ id: Date.now().toString(), name: invoice.supplier, catalog: invoice.items.map(i => ({ sku: i.sku, name: i.name, lastCost: i.costUnitUSD })) }); }

        const newInvoice = { ...invoice, paidAmountUSD: invoice.status === 'PAID' ? invoice.totalUSD : 0, payments: [] };
        const freightPerUnit = invoice.items.length > 0 ? invoice.freightTotalUSD / invoice.items.reduce((acc, item) => acc + item.quantity, 0) : 0;
        const updatedProducts = [...products];

        invoice.items.forEach(incomingItem => {
          const existingIndex = updatedProducts.findIndex(p => p.sku === incomingItem.sku);
          if (existingIndex >= 0) {
            const prod = updatedProducts[existingIndex];
            updatedProducts[existingIndex] = { ...prod, stock: prod.stock + incomingItem.quantity, cost: incomingItem.costUnitUSD, freight: freightPerUnit };
          } else {
            updatedProducts.push({ id: Date.now().toString() + Math.random(), sku: incomingItem.sku, name: incomingItem.name, category: 'General', stock: incomingItem.quantity, minStock: incomingItem.minStock || 5, cost: incomingItem.costUnitUSD, freight: freightPerUnit, costType: invoice.costType, supplier: invoice.supplier });
          }
        });
        set((state) => ({ products: updatedProducts, invoices: [...state.invoices, newInvoice], suppliers: updatedSuppliers }));
        return true;
      },

      updateInvoice: (updatedInvoice) => {
        const { invoices } = get();
        const subtotal = updatedInvoice.items.reduce((acc, item) => acc + (item.quantity * item.costUnitUSD), 0);
        const total = subtotal + updatedInvoice.freightTotalUSD;
        const paidAmount = updatedInvoice.payments.reduce((acc, p) => acc + p.amountUSD, 0);
        let status: any = 'PENDING';
        if (paidAmount >= (total - 0.01)) status = 'PAID'; else if (paidAmount > 0) status = 'PARTIAL';
        set({ invoices: invoices.map(inv => inv.id === updatedInvoice.id ? { ...updatedInvoice, subtotalUSD: subtotal, totalUSD: total, paidAmountUSD: paidAmount, status: status } : inv) });
      },

      registerPayment: (invoiceId, payment) => {
        const { invoices } = get();
        set({
          invoices: invoices.map(inv => {
            if (inv.id !== invoiceId) return inv;
            const newPaidAmount = inv.paidAmountUSD + payment.amountUSD;
            let newStatus: any = newPaidAmount >= (inv.totalUSD - 0.01) ? 'PAID' : 'PARTIAL';
            return { ...inv, paidAmountUSD: newPaidAmount, status: newStatus, payments: [...inv.payments, payment] };
          })
        });
      },

      addToCart: (product) => {
        const { settings, cart } = get();
        const existingItem = cart.find((item) => item.id === product.id);
        const currentQtyInCart = existingItem ? existingItem.quantity : 0;
        if (product.stock === 0) { alert("¡Producto agotado!"); return; }
        if (currentQtyInCart + 1 > product.stock) { alert(`Stock insuficiente (Max: ${product.stock})`); return; }
        if (existingItem) { set({ cart: cart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) }); }
        else { const prices = calculatePrices(product, settings); set({ cart: [...cart, { ...product, quantity: 1, priceBaseUSD: prices.basePriceUSD, priceTaxUSD: prices.taxAmountUSD, priceFinalUSD: prices.finalPriceUSD }] }); }
      },

      removeFromCart: (productId) => set((state) => ({ cart: state.cart.filter((p) => p.id !== productId) })),
      updateCartQuantity: (productId, quantity) => {
        const { products } = get();
        const product = products.find(p => p.id === productId);
        if (!product) return;
        if (quantity > product.stock) { alert(`Stock insuficiente.`); return; }
        set((state) => ({ cart: state.cart.map((p) => p.id === productId ? { ...p, quantity: Math.max(1, quantity) } : p) }));
      },
      clearCart: () => set({ cart: [] }),

      completeSale: (paymentMethod) => {
        const { cart, products, sales, settings } = get();
        if (cart.length === 0) return;
        const totalUSD = cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0);
        const newSale: Sale = { id: Date.now().toString(), date: new Date().toISOString(), totalUSD, totalVED: totalUSD * settings.tasaBCV, items: [...cart], status: 'COMPLETED', paymentMethod };
        const updatedProducts = products.map(product => {
          const cartItem = cart.find(item => item.id === product.id);
          if (cartItem) return { ...product, stock: product.stock - cartItem.quantity };
          return product;
        });
        set({ products: updatedProducts, sales: [...sales, newSale], cart: [] });
      },

      updateSale: (updatedSale) => {
        const { sales, products, settings } = get();
        const oldSale = sales.find(s => s.id === updatedSale.id);
        if (!oldSale) return false;
        let tempProducts = products.map(p => ({ ...p }));
        oldSale.items.forEach(oldItem => { const pIndex = tempProducts.findIndex(p => p.id === oldItem.id); if (pIndex >= 0) tempProducts[pIndex].stock += oldItem.quantity; });
        for (const newItem of updatedSale.items) {
          const pIndex = tempProducts.findIndex(p => p.id === newItem.id);
          if (pIndex === -1) continue;
          if (newItem.quantity > tempProducts[pIndex].stock) { alert(`ERROR: Stock insuficiente para ${tempProducts[pIndex].name}`); return false; }
          tempProducts[pIndex].stock -= newItem.quantity;
        }
        const totalUSD = updatedSale.items.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0);
        set({ products: tempProducts, sales: sales.map(s => s.id === updatedSale.id ? { ...updatedSale, totalUSD, totalVED: totalUSD * settings.tasaBCV } : s) });
        return true;
      },

      annulSale: (saleId) => {
        const { sales, products } = get();
        const saleToAnnul = sales.find(s => s.id === saleId);
        if (!saleToAnnul || saleToAnnul.status === 'CANCELLED') return;
        if (!window.confirm("¿ANULAR venta? Stock será devuelto.")) return;
        let updatedProducts = [...products];
        saleToAnnul.items.forEach(item => { const pIndex = updatedProducts.findIndex(p => p.id === item.id); if (pIndex >= 0) updatedProducts[pIndex].stock += item.quantity; });
        set({ products: updatedProducts, sales: sales.map(s => s.id === saleId ? { ...s, status: 'CANCELLED' } : s) });
        alert("Venta anulada.");
      },

      registerDailyClose: (notes) => {
        const { sales, dailyCloses } = get();
        const todayStr = new Date().toLocaleDateString('es-ES');
        if (dailyCloses.some(c => new Date(c.date).toLocaleDateString('es-ES') === todayStr)) { alert("⚠️ Ya has realizado el cierre de caja hoy."); return; }
        const todaysSales = sales.filter(s => new Date(s.date).toLocaleDateString('es-ES') === todayStr && s.status !== 'CANCELLED');
        if (todaysSales.length === 0) { if (!window.confirm("No hay ventas hoy. ¿Cerrar en $0?")) return; }
        const totalUSD = todaysSales.reduce((acc, s) => acc + s.totalUSD, 0);
        const totalByMethod: Record<string, number> = {};
        todaysSales.forEach(s => { const method = s.paymentMethod || 'Efectivo'; totalByMethod[method] = (totalByMethod[method] || 0) + s.totalUSD; });
        const newClose: DailyClose = { id: Date.now().toString(), date: new Date().toISOString(), totalUSD, totalByMethod, totalTickets: todaysSales.length, notes };
        set({ dailyCloses: [newClose, ...dailyCloses] });
        alert("✅ Cierre de Caja guardado con éxito.");
      }
    }),
    { name: 'todo-en-ruedas-storage', storage: createJSONStorage(() => localStorage) }
  )
);