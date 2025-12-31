import { create } from 'zustand';
import type { GlobalSettings, Product, CartItem, Sale, Invoice, Payment, Supplier } from '../types';
import { calculatePrices } from '../utils/pricing';

interface AppState {
  settings: GlobalSettings;
  products: Product[];
  cart: CartItem[];
  sales: Sale[];
  invoices: Invoice[];
  suppliers: Supplier[];

  updateSettings: (newSettings: Partial<GlobalSettings>) => void;
  addProduct: (product: Product) => void;
  updateProduct: (id: string, updatedData: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  addInvoice: (invoice: Invoice) => void;
  registerPayment: (invoiceId: string, payment: Payment) => void;

  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  completeSale: (paymentMethod: string) => void;
}

// --- DATOS PRECARGADOS ---

// PROVEEDOR CON CATÁLOGO HISTÓRICO LLENO (CORRECCIÓN AQUÍ)
const initialSuppliers: Supplier[] = [
  {
    id: 'sup-1',
    name: 'Inversiones La Fuente, C.A.',
    catalog: [
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
      { sku: '05-023-069', name: 'Rueda Neumatica 14" Eje 3/4" P/Carret', lastCost: 16.38 },
      { sku: '05-023-070', name: 'Rueda P/Porton 50MM*15MM EXXEL', lastCost: 2.99 },
      { sku: '05-023-071', name: 'Rueda P/Porton 70MM*18MM EXXEL', lastCost: 5.14 },
      { sku: '05-023-279', name: 'Rueda Giratoria 5" EXXEL', lastCost: 2.34 },
      { sku: '05-023-324', name: 'Rueda Fija 2.5" EXXEL', lastCost: 2.34 }
    ]
  }
];

const initialProducts: Product[] = [
  // Factura 86
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
  // Factura 85
  { id: '12', sku: '05-023-069', name: 'Rueda Neumatica 14" Eje 3/4" P/Carret', category: 'Ruedas', stock: 1, minStock: 1, cost: 16.38, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '13', sku: '05-023-070', name: 'Rueda P/Porton 50MM*15MM EXXEL', category: 'Ruedas', stock: 4, minStock: 2, cost: 2.99, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '14', sku: '05-023-071', name: 'Rueda P/Porton 70MM*18MM EXXEL', category: 'Ruedas', stock: 4, minStock: 2, cost: 5.14, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '15', sku: '05-023-279', name: 'Rueda Giratoria 5" EXXEL', category: 'Ruedas', stock: 2, minStock: 1, cost: 2.34, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
  { id: '16', sku: '05-023-324', name: 'Rueda Fija 2.5" EXXEL', category: 'Ruedas', stock: 2, minStock: 1, cost: 2.34, freight: 0, costType: 'BCV', supplier: 'Inversiones La Fuente, C.A.' },
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
    items: []
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
    items: []
  }
];

export const useStore = create<AppState>((set, get) => ({
  settings: {
    tasaBCV: 301.14,
    tasaTH: 600.00,
    defaultMargin: 30,
    defaultVAT: 16,
    lastUpdated: new Date().toISOString(),
    showMonitorRate: true,
  },
  products: initialProducts,
  cart: [],
  sales: [],
  invoices: initialInvoices,
  suppliers: initialSuppliers,

  updateSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),
  addProduct: (product) => set((state) => ({ products: [...state.products, product] })),
  updateProduct: (id, updatedData) => set((state) => ({ products: state.products.map((p) => p.id === id ? { ...p, ...updatedData } : p) })),
  deleteProduct: (id) => set((state) => ({ products: state.products.filter((p) => p.id !== id) })),

  addInvoice: (invoice) => {
    const { products, suppliers } = get();

    // 1. Gestionar Proveedor
    let updatedSuppliers = [...suppliers];
    const existingSupplierIndex = suppliers.findIndex(s => s.name.trim().toLowerCase() === invoice.supplier.trim().toLowerCase());

    if (existingSupplierIndex >= 0) {
      const supplier = updatedSuppliers[existingSupplierIndex];
      const newCatalog = [...supplier.catalog];
      invoice.items.forEach(item => {
        const catIndex = newCatalog.findIndex(c => c.sku === item.sku);
        if (catIndex >= 0) newCatalog[catIndex].lastCost = item.costUnitUSD;
        else newCatalog.push({ sku: item.sku, name: item.name, lastCost: item.costUnitUSD });
      });
      updatedSuppliers[existingSupplierIndex] = { ...supplier, catalog: newCatalog };
    } else {
      updatedSuppliers.push({
        id: Date.now().toString(),
        name: invoice.supplier,
        catalog: invoice.items.map(i => ({ sku: i.sku, name: i.name, lastCost: i.costUnitUSD }))
      });
    }

    // 2. Gestionar Factura
    const newInvoice = {
      ...invoice,
      paidAmountUSD: invoice.status === 'PAID' ? invoice.totalUSD : 0,
      payments: []
    };

    // 3. Actualizar Inventario
    const totalItemsCount = invoice.items.reduce((acc, item) => acc + item.quantity, 0);
    const freightPerUnit = totalItemsCount > 0 ? invoice.freightTotalUSD / totalItemsCount : 0;
    const updatedProducts = [...products];

    invoice.items.forEach(incomingItem => {
      const existingIndex = updatedProducts.findIndex(p => p.sku === incomingItem.sku);
      if (existingIndex >= 0) {
        const prod = updatedProducts[existingIndex];
        updatedProducts[existingIndex] = {
          ...prod,
          stock: prod.stock + incomingItem.quantity,
          cost: incomingItem.costUnitUSD,
          freight: freightPerUnit,
          supplier: invoice.supplier,
          costType: invoice.costType
        };
      } else {
        updatedProducts.push({
          id: Date.now().toString() + Math.random(),
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

    set((state) => ({
      products: updatedProducts,
      invoices: [...state.invoices, newInvoice],
      suppliers: updatedSuppliers
    }));
  },

  registerPayment: (invoiceId, payment) => {
    const { invoices } = get();
    const updatedInvoices = invoices.map(inv => {
      if (inv.id !== invoiceId) return inv;
      const newPaidAmount = inv.paidAmountUSD + payment.amountUSD;
      let newStatus = inv.status;
      if (newPaidAmount >= (inv.totalUSD - 0.01)) newStatus = 'PAID';
      else newStatus = 'PARTIAL';
      return { ...inv, paidAmountUSD: newPaidAmount, status: newStatus, payments: [...inv.payments, payment] };
    });
    set({ invoices: updatedInvoices });
  },

  addToCart: (product) => {
    const { settings, cart } = get();
    const existingItem = cart.find((item) => item.id === product.id);
    if (existingItem) {
      set({ cart: cart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) });
    } else {
      const prices = calculatePrices(product, settings);
      set({ cart: [...cart, { ...product, quantity: 1, priceBaseUSD: prices.basePriceUSD, priceTaxUSD: prices.taxAmountUSD, priceFinalUSD: prices.finalPriceUSD }] });
    }
  },

  removeFromCart: (productId) => set((state) => ({ cart: state.cart.filter((p) => p.id !== productId) })),
  updateCartQuantity: (productId, quantity) => set((state) => ({ cart: state.cart.map((p) => p.id === productId ? { ...p, quantity: Math.max(1, quantity) } : p) })),
  clearCart: () => set({ cart: [] }),
  completeSale: (paymentMethod) => {
    console.log("Pago:", paymentMethod);
    const { cart, products, sales, settings } = get();
    if (cart.length === 0) return;
    const totalUSD = cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0);
    const totalVED = totalUSD * settings.tasaBCV;
    const newSale: Sale = { id: Date.now().toString(), date: new Date().toISOString(), totalUSD, totalVED, items: [...cart] };
    const updatedProducts = products.map(product => {
      const cartItem = cart.find(item => item.id === product.id);
      if (cartItem) return { ...product, stock: product.stock - cartItem.quantity };
      return product;
    });
    set({ products: updatedProducts, sales: [...sales, newSale], cart: [] });
  },
}));