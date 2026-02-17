/**
 * @file store/types.ts
 * @description Interfaz completa del Store.
 * Todos los slices y páginas importan de aquí.
 */

import type { User } from '@supabase/supabase-js';
import type {
  Product, CartItem, Sale, Invoice, Payment, AppSettings,
  Supplier, PaymentMethod, Client, AppUser
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
  currentUserData: AppUser | null;

  // --- Auth ---
  checkSession: () => Promise<void>;
  login: (email: string, pass: string) => Promise<boolean>;
  logout: () => Promise<void>;
  fetchInitialData: () => Promise<void>;

  // --- Settings ---
  updateSettings: (settings: AppSettings) => Promise<void>;
  performDailyClose: () => Promise<void>;
  addPaymentMethod: (name: string, currency: 'USD' | 'BS') => Promise<void>;
  deletePaymentMethod: (id: string) => Promise<void>;

  // --- Products ---
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  // --- Clients ---
  addClient: (client: Client) => Promise<void>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;

  // --- Cart ---
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  // --- Sales ---
  completeSale: (paymentMethod: string, clientId?: string, initialPayment?: number) => Promise<void>;
  annulSale: (saleId: string) => Promise<void>;
  deleteSale: (saleId: string) => Promise<void>;
  registerSalePayment: (saleId: string, payment: Payment) => Promise<void>;

  // --- Invoices ---
  addInvoice: (invoice: Invoice) => Promise<boolean>;
  updateInvoice: (invoice: Invoice) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  registerPayment: (invoiceId: string, payment: Payment) => Promise<void>;

  // --- Users ---
  fetchUsers: () => Promise<void>;
  fetchCurrentUserData: () => Promise<void>;
  setupFirstAdmin: (setupData: { companyName: string; fullName: string; email: string; password: string }) => Promise<boolean>;
  createUser: (userData: { email: string; password: string; fullName: string; role: AppUser['role'] }) => Promise<boolean>;
  updateUser: (userId: string, updates: Partial<AppUser>) => Promise<boolean>;
  deactivateUser: (userId: string) => Promise<void>;
  activateUser: (userId: string) => Promise<void>;
  changeUserPassword: (userId: string, newPassword: string) => Promise<void>;
}
