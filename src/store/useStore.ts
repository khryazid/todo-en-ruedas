/**
 * @file useStore.ts
 * @description Store principal — combina todos los slices.
 *
 * ✅ SPRINT 2: De 828 líneas monolíticas a un orquestador limpio.
 *
 * Estructura:
 *   store/
 *   ├── useStore.ts          ← Este archivo
 *   ├── types.ts             ← Interfaz StoreState
 *   └── slices/
 *       ├── authSlice.ts     ← Auth + fetchInitialData
 *       ├── productSlice.ts  ← CRUD productos
 *       ├── cartSlice.ts     ← Carrito POS
 *       ├── saleSlice.ts     ← Ventas, anulación, abonos
 *       ├── invoiceSlice.ts  ← Facturas compra, proveedores
 *       ├── clientSlice.ts   ← CRUD clientes
 *       └── settingsSlice.ts ← Config, métodos de pago, cierre
 */

import { create } from 'zustand';
import type { StoreState } from './types';

import { createAuthSlice } from './slices/authSlice';
import { createProductSlice } from './slices/productSlice';
import { createCartSlice } from './slices/cartSlice';
import { createSaleSlice } from './slices/saleSlice';
import { createInvoiceSlice } from './slices/invoiceSlice';
import { createClientSlice } from './slices/clientSlice';
import { createSettingsSlice } from './slices/settingsSlice';

export const useStore = create<StoreState>((set, get) => ({
  ...createAuthSlice(set, get),
  ...createSettingsSlice(set, get),
  ...createProductSlice(set, get),
  ...createCartSlice(set, get),
  ...createSaleSlice(set, get),
  ...createInvoiceSlice(set, get),
  ...createClientSlice(set, get),
}));
