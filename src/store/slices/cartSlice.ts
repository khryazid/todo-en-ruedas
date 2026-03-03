/**
 * @file slices/cartSlice.ts
 * @description Operaciones del carrito de compras (POS).
 */

import type { Product, CartItem, Quote, PriceList } from '../../types';
import type { SetState } from '../types';
import { calculatePrices } from '../../utils/pricing';

export const createCartSlice = (set: SetState) => ({

  cart: [] as CartItem[],

  addToCart: (product: Product, priceList?: PriceList) => set((state) => {
    const existing = state.cart.find((item) => item.id === product.id);
    const { finalPriceUSD: priceFinalUSD } = calculatePrices(product, state.settings, priceList);

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

  recalculateCartPrices: (priceList?: PriceList) => set((state) => ({
    cart: state.cart.map(item => {
      const { finalPriceUSD: priceFinalUSD } = calculatePrices(item, state.settings, priceList);
      return { ...item, priceFinalUSD };
    })
  })),

  loadQuoteIntoCart: (quote: Quote, products: Product[]) => set(() => {
    const newCart: CartItem[] = [];
    for (const item of quote.items) {
      const p = products.find(prod => prod.id === item.productId);
      if (p) {
        newCart.push({
          ...p,
          quantity: item.quantity,
          priceFinalUSD: item.priceFinalUSD,
          discountPct: item.discountPct,
        });
      }
    }
    // Also, when loaded from quote, we should only bring items that exist in our products db.
    return { cart: newCart };
  }),
});
