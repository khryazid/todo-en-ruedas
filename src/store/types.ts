/**
 * @file store/types.ts
 * @description Interfaz completa del Store.
 * Todos los slices y páginas importan de aquí.
 */

import type { User } from '@supabase/supabase-js';
import type {
  Product, CartItem, Sale, Invoice, Payment, AppSettings,
  Supplier, PaymentMethod, Client, AppUser, Quote, SaleReturn, Expense, CashClose,
  StockMovement, ReturnOption
} from '../types';

export type SetState = (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void;
export type GetState = () => StoreState;

export interface StoreState {
  // --- Estado ---
  user: User | null;
  isLoading: boolean;
  settingsId: string | null;
  settings: AppSettings;
  products: Product[];
  cart: CartItem[];
  sales: Sale[];
  invoices: Invoice[];
  suppliers: Supplier[];
  clients: Client[];
  paymentMethods: PaymentMethod[];
  users: AppUser[];
  quotes: Quote[];
  currentUserData: AppUser | null;

  // --- Auth ---
  checkSession: () => Promise<void>;
  login: (email: string, pass: string) => Promise<boolean>;
  logout: () => Promise<void>;
  fetchInitialData: () => Promise<void>;

  // --- Settings ---
  updateSettings: (settings: AppSettings) => Promise<void>;
  performDailyClose: (turnData?: { totalUSD: number; totalBs: number; txCount: number }) => Promise<CashClose | null>;
  addPaymentMethod: (name: string, currency: 'USD' | 'BS') => Promise<void>;
  deletePaymentMethod: (id: string) => Promise<void>;

  // --- Quotes ---
  fetchQuotes: () => Promise<void>;
  addQuote: (quote: Quote) => Promise<void>;
  updateQuote: (id: string, updates: Partial<Quote>) => Promise<void>;
  deleteQuote: (id: string) => Promise<void>;
  convertQuoteToSale: (quoteId: string, paymentMethod: string) => Promise<boolean>;

  // --- Returns ---
  returns: SaleReturn[];
  fetchReturns: () => Promise<void>;
  addReturn: (ret: Omit<SaleReturn, 'id' | 'date'>, option?: ReturnOption) => Promise<boolean>;

  // --- Stock Movements ---
  stockMovements: StockMovement[];
  fetchStockMovements: (productId?: string) => Promise<void>;
  addStockMovement: (payload: import('./slices/stockMovementSlice').AddMovementPayload) => Promise<void>;

  // --- Expenses ---
  expenses: Expense[];
  fetchExpenses: () => Promise<void>;
  addExpense: (expense: Omit<Expense, 'id'>) => Promise<void>;
  updateExpense: (id: string, updates: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;

  // --- Products ---
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  // --- Clients ---
  addClient: (client: Client) => Promise<void>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  applyClientCredit: (clientId: string, delta: number) => Promise<void>;

  // --- Cart ---
  addToCart: (product: Product, priceList?: import('../types').PriceList) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  recalculateCartPrices: (priceList?: import('../types').PriceList) => void;
  loadQuoteIntoCart: (quote: Quote, products: Product[]) => void;

  // --- Sales ---
  completeSale: (paymentMethod: string, clientId?: string, initialPayment?: number) => Promise<Sale | null>;
  annulSale: (saleId: string) => Promise<void>;
  deleteSale: (saleId: string) => Promise<void>;
  registerSalePayment: (saleId: string, payment: Payment) => Promise<void>;

  // --- Suppliers ---
  addSupplier: (s: Omit<Supplier, 'id' | 'createdAt'>) => Promise<void>;
  updateSupplier: (id: string, updates: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<boolean>;

  // --- Invoices ---
  addInvoice: (invoice: Invoice) => Promise<boolean>;
  updateInvoice: (invoice: Invoice) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  registerPayment: (invoiceId: string, payment: Payment) => Promise<void>;

  // --- Users ---
  fetchUsers: () => Promise<void>;
  fetchCurrentUserData: () => Promise<void>;
  setupFirstAdmin: (setupData: { companyName: string; rif: string; rifType: 'J' | 'V' | 'E' | 'G' | 'P' | 'C'; address: string; fullName: string; email: string; password: string; defaultMargin: number; defaultVAT: number; }) => Promise<boolean>;
  createUser: (userData: { email: string; password: string; fullName: string; role: AppUser['role'] }) => Promise<boolean>;
  updateUser: (userId: string, updates: Partial<AppUser>) => Promise<boolean>;
  deactivateUser: (userId: string) => Promise<void>;
  activateUser: (userId: string) => Promise<void>;
  changeUserPassword: (userId: string, newPassword: string) => Promise<void>;
}
