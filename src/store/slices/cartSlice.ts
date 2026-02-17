/**
 * @file slices/cartSlice.ts
 * @description Operaciones del carrito de compras (POS).
 */

import type { Product, CartItem } from '../../types';
import type { SetState, GetState } from '../types';

export const createCartSlice = (set: SetState, _get: GetState) => ({

  cart: [] as CartItem[],

  addToCart: (product: Product) => set((state) => {
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

  removeFromCart: (id: string) => set((state) => ({
    cart: state.cart.filter((item) => item.id !== id)
  })),

  updateCartQuantity: (id: string, quantity: number) => set((state) => ({
    cart: quantity <= 0
      ? state.cart.filter((item) => item.id !== id)
      : state.cart.map((item) => item.id === id ? { ...item, quantity } : item)
  })),

  clearCart: () => set({ cart: [] }),
});
